/**
 * Sql proxy to save Ext.data.Model instances for offline use. Will default to cordova sqlitePlugin if present,
 * otherwise will use websql. Model schema changes are not supported once deployed to production.
 */
Ext.define('DBProxies.data.proxy.Sql', {
    alias: 'proxy.sql',
    extend: 'DBProxies.data.proxy.Db',

    requires: [
        'DBProxies.data.SqlConnection'
    ],

    isSQLProxy: true,

    config: {
        /**
         * @cfg {String} tableName
         * The name of the sql table. Will default to the string after the last '.' in the model's class name
         */
        tableName: null,

        /**
         * @cfg {String} defaultDateFormat
         * The date format to use to store data in sql
         */
        defaultDateFormat: 'Y-m-d H:i:s.u',

        /**
         * @cfg {String} implicitFieldsColName
         * The name of the database column that will store all the implicit fields. This only needs to be changed if
         * for some reason the model has an explicitly defined field named 'implicit'
         */
        implicitFieldsColName: 'implicit'
    },

    statics: {
        isSupported: function() {
            return !!window.openDatabase;
        }
    },

    getDatabaseObject: function() {
        return DBProxies.data.SqlConnection.getConn();
    },

    updateModel: function(model) {

        var modelName;
        var defaultDateFormat;
        var table;

        if (model) {

            modelName = model.prototype.entityName;
            defaultDateFormat = this.getDefaultDateFormat();
            table = modelName.slice(modelName.lastIndexOf('.') + 1);

            Ext.each(model.getFields(), function(field) {
                if (field.getType().type === 'date' && !field.getDateFormat()) {
                    field.setDateFormat(defaultDateFormat);
                }
            }, this);

            if (!this.getTableName()) {
                this.setTableName(table);
            }

            this.columns = this.getPersistedModelColumns(model);
        }

        this.callParent(arguments);

    },

    createTable: function(transaction) {

        transaction.executeSql([
            'CREATE TABLE IF NOT EXISTS ',
            this.getTableName(),
            ' (', this.getSchemaString(), ')'
        ].join(''));
        this.tableExists = true;

    },

    getColumnValues: function(columns, data) {

        var ln = columns.length,
            values = [],
            i, column, value;

        for (i = 0; i < ln; i++) {
            column = columns[i];
            value = data[column];
            if (value !== undefined) {
                values.push(value);
            }
        }

        return values;

    },

    getPersistedModelColumns: function(model) {

        var fields = model.getFields().items;
        var columns = [];
        var ln = fields.length;
        var i;
        var field;
        var name;

        for (i = 0; i < ln; i++) {
            field = fields[i];
            name = field.getName();

            if (field.getPersist()) {
                columns.push(field.getName());
            }
        }

        if (this.getImplicitFields()) {
            columns.push(this.getImplicitFieldsColName());
        }

        return columns;

    },

    writeDate: function(field, date) {

        if (Ext.isEmpty(date)) {
            return null;
        }

        var dateFormat = field.getDateFormat() || this.getDefaultDateFormat();
        switch (dateFormat) {
            case 'timestamp':
                return date.getTime() / 1000;
            case 'time':
                return date.getTime();
            default:
                return date.getTime();
        }

    },

    dropTable: function(config) {

        var me = this;
        var table = me.getTableName();
        var callback = config ? config.callback : null;
        var scope = config ? config.scope || me : null;
        var db = me.getDatabaseObject();

        db.transaction(function(transaction) {
                transaction.executeSql('DROP TABLE ' + table);
            },
            function(transaction, error) {
                if (typeof callback == 'function') {
                    callback.call(scope || me, false, table, error);
                }
            },
            function(transaction) {
                if (typeof callback == 'function') {
                    callback.call(scope || me, true, table);
                }
            }
        );

        me.tableExists = false;

    },

    getSchemaString: function() {

        var schema = [];
        var model = this.getModel();
        var idProperty = model.prototype.getIdProperty();
        var fields = model.getFields().items;
        var ln = fields.length;
        var i;
        var field;
        var type;
        var name;
        var persist;

        for (i = 0; i < ln; i++) {
            field = fields[i];

            if (!field.type) {
                continue;
            }
            type = field.type;
            name = field.name;
            persist = field.persist;
            if (!persist) {
                continue;
            }

            type = this.convertToSqlType(type);

            if (name === idProperty) {
                schema.unshift(idProperty + ' ' + type + ' PRIMARY KEY');
            } else {
                schema.push(name + ' ' + type);
            }
        }

        if (this.getImplicitFields()) {
            schema.push(this.getImplicitFieldsColName() + ' TEXT');
        }

        return schema.join(', ');

    },

    decodeRecordData: function(data) {

        var key;
        var newData = {};
        var fields = this.getModel().getFields().items;
        var fieldTypes = {};

        Ext.each(fields, function(field) {
            fieldTypes[field.getName()] = field.type;
        });

        for (key in data) {
            if (Ext.isDefined(fieldTypes[key]) &&
                (fieldTypes[key] == 'auto') &&
                Ext.isString(data[key]) &&
                Ext.Array.contains(['[', '{'], data[key][0])) {
                if (Ext.isEmpty(data[key])) {
                    newData[key] = null;
                } else {
                    newData[key] = Ext.decode(data[key]);
                }
            } else if (key === this.getImplicitFieldsColName()) {
                Ext.apply(newData, Ext.JSON.decode(data[key]));
            } else {
                newData[key] = data[key];
            }
        }

        return newData;
    },

    getRecordData: function(record) {

        var fields = record.getFields();
        var data = {};
        var name;
        var value;
        var newValue;
        var explicitFieldNames = [];
        var implicitData = {};
        var field;

        Ext.each(fields, function(field) {

            explicitFieldNames.push(field.name);
            if (!Ext.isDefined(field.persist) || field.persist) {
                name = field.name;

                value = record.get(name);
                if (field.type == 'date') {
                    newValue = this.writeDate(field, value);
                }
                else if (!Ext.isDefined(value)) {
                    newValue = "";
                }
                else if (field.type == 'auto' && (Ext.isObject(value) || Ext.isArray(value))) {
                    if (Ext.isEmpty(value)) {
                        newValue = "";
                    } else {
                        newValue = Ext.encode(value);
                    }
                } else {
                    newValue = value;
                }
                data[name] = newValue;
            }

        }, this);

        if (this.getImplicitFields()) {
            for (field in record.data) {
                if (!Ext.Array.contains(explicitFieldNames, field)) {
                    implicitData[field] = record.data[field];
                }
            }
            data[this.getImplicitFieldsColName()] = Ext.JSON.encode(implicitData);
        }

        return data;
    },

    convertToSqlType: function(type) {
        switch (type.toLowerCase()) {
            case 'date':
            case 'string':
            case 'array':
            case 'object':
            case 'auto':
                return 'TEXT';
            case 'int':
                return 'INTEGER';
            case 'float':
                return 'REAL';
            case 'bool':
            case 'boolean':
                return 'NUMERIC';
        }
    },

    transactionError: function(tx, error) {
        var args = arguments;
        var options = args[args.length - 1];
        console.error('sql proxy transaction error: ', error);
        this.setException(options.operation, error);
        if (options.callback) {
            Ext.callback(options.callback, options.scope, [options.operation]);
        }
    },


    /* CREATE */
    create: function(operation) {

        var options = {
            operation: operation,
            records: operation.getRecords()
        };

        operation.setStarted();
        this.getDatabaseObject().transaction(
            Ext.bind(this.createTransaction, this, [options], true),
            Ext.bind(this.transactionError, this, [options], true)
        );

    },

    createTransaction: function(tx) {

        var args = arguments;
        var options = args[args.length - 1];
        var tmp = [];
        var i;
        var ln;
        var placeholders;

        if (!this.tableExists) {
            this.createTable(tx);
        }

        for (i = 0, ln = this.columns.length; i < ln; i++) {
            tmp.push('?');
        }
        placeholders = tmp.join(', ');

        Ext.apply(options, {
            tx: tx,
            resultSet: new Ext.data.ResultSet({
                success: true
            }),
            table: this.getTableName(),
            columns: this.columns,
            totalRecords: options.records.length,
            executedRecords: 0,
            errors: [],
            placeholders: placeholders
        });

        Ext.each(options.records, Ext.bind(this.createRecord, this, [options], true));

    },

    createRecord: function(record, i, records, options) {

        if (!record.phantom) {
            options.executedRecords += 1;
            this.createRecordCallback(options);
            return;
        }

        var id = record.getId();
        var data = this.getRecordData(record);
        var values = this.getColumnValues(options.columns, data);

        options.tx.executeSql([
                'INSERT INTO ', options.table,
                ' (', options.columns.join(', '), ')',
                ' VALUES (', options.placeholders, ')'
            ].join(''), values,
            Ext.bind(this.createRecordSuccess, this, [options, record, data], true),
            Ext.bind(this.createRecordError, this, [options, record], true)
        );

    },

    createRecordSuccess: function(tx, result, options, record, data) {

        data = this.decodeRecordData(data);

        if (this.getCloud() && record.session) {
            record.session.addOperation({
                model: record.get('model'),
                record_id: record.getId(),
                type: 'create',
                fields: data
            });
        }

        options.executedRecords += 1;

        record.phantom = false;
        record.commit();

        this.createRecordCallback(options);

    },

    createRecordError: function(tx, error, options, record) {

        console.error('INSERT ERROR:', error);

        options.executedRecords += 1;
        options.errors.push({
            clientId: record.getId(),
            error: error
        });

        this.createRecordCallback(options);

    },

    createRecordCallback: function(options) {
        if (options.executedRecords === options.totalRecords) {
            this.createComplete(options);
        }
    },

    createComplete: function(options) {

        if (options.operation.process(options.resultSet) === false) {
            this.fireEvent('exception', this, options.operation);
        }

        if (options.errors) {
            options.operation.setException(options.errors);
        }

    },


    /* ERASE */
    erase: function(operation, callback, scope) {

        var erasedRecords = [];
        var options = {
            operation: operation,
            callback: callback || Ext.emptyFn,
            scope: scope || {},
            records: operation.getRecords(),
            erasedRecords: erasedRecords,
            resultSet: new Ext.data.ResultSet({
                records: erasedRecords,
                success: true
            })
        };

        operation.setStarted();

        this.getDatabaseObject().transaction(
            Ext.bind(this.eraseTransaction, this, [options], true),
            Ext.bind(this.transactionError, this, [options], true),
            Ext.bind(this.eraseTransactionSuccess, this, [options], true)
        );

    },

    eraseTransaction: function(tx) {

        var args = arguments;
        var options = args[args.length - 1];

        if (!this.tableExists) {
            this.createTable(tx);
        }

        Ext.apply(options, {
            tx: tx,
            idProperty: this.getModel().prototype.getIdProperty(),
            table: this.getTableName(),
            errors: []
        });

        Ext.each(options.records, Ext.bind(this.eraseRecord, this, [options], true));

    },

    eraseRecord: function(record, i, records, options) {
        options.tx.executeSql([
                'DELETE FROM ', options.table,
                ' WHERE ', options.idProperty, ' = ?'
            ].join(''), [record.getId()],
            Ext.bind(this.eraseRecordSuccess, this, [options, record], true),
            Ext.emptyFn
        );
    },

    eraseRecordSuccess: function(tx, result, options, record) {

        if (this.getCloud() && record.session) {
            record.session.addOperation({
                model: record.get('model'),
                record_id: record.getId(),
                type: 'delete'
            });
        }

        options.erasedRecords.push(record);

    },

    eraseTransactionSuccess: function() {
        var args = arguments;
        var options = args[args.length - 1];

        if (options.operation.process(options.resultSet) === false) {
            this.fireEvent('exception', this, options.operation);
        }

        if (options.error) {
            options.operation.setException(options.error);
        }

        Ext.callback(options.callback, options.scope, [options.operation]);
    },


    /* READ */
    read: function(operation, callback, scope) {

        var options = {
            operation: operation,
            callback: callback || Ext.emptyFn,
            scope: scope || {}
        };

        operation.setStarted();
        this.getDatabaseObject().transaction(
            Ext.bind(this.readTransaction, this, [options], true),
            Ext.bind(this.transactionError, this, [options], true)
        );

    },

    readTransaction: function(tx) {

        var args = arguments;
        var options = args[args.length - 1];
        var records = [];
        var values = [];
        var sql;
        var params = options.operation.getParams() || {};

        if (!this.tableExists) {
            this.createTable(tx);
        }

        Ext.apply(params, {
            page: options.operation.getPage(),
            start: options.operation.getStart(),
            limit: options.operation.getLimit(),
            sorters: options.operation.getSorters(),
            filters: options.operation.getFilters(),
            recordId: options.operation.getId()
        });

        Ext.apply(options, {
            tx: tx,
            idProperty: this.getModel().prototype.getIdProperty(),
            recordCreator: options.operation.getRecordCreator(),
            params: params,
            records: records,
            resultSet: new Ext.data.ResultSet({
                records: records,
                success: true
            }),
            table: this.getTableName(),
            errors: []
        });

        if (options.params.recordId) {
            sql = this.readFromIdBuildQuery(options, values);
        } else {
            sql = this.readMultipleBuildQuery(options, values);
        }

        options.tx.executeSql(sql, values,
            Ext.bind(this.readQuerySuccess, this, [options], true),
            Ext.bind(this.readQueryError, this, [options], true)
        );

    },

    readQuerySuccess: function(tx, result, options) {

        var rows = result.rows;
        var count = rows.length;
        var i;
        var data;
        var model = this.getModel();

        for (i = 0; i < count; i += 1) {
            data = this.decodeRecordData(rows.item(i));
            options.records.push(Ext.isFunction(options.recordCreator) ?
                options.recordCreator(data, model) :
                new model(data));
        }

        options.resultSet.setSuccess(true);
        options.resultSet.setTotal(count);
        options.resultSet.setCount(count);

        this.readComplete(options);

    },

    readQueryError: function(tx, errors, options) {

        console.error('READ ERROR:', errors);
        options.errors.push(errors);

        options.resultSet.setSuccess(false);
        options.resultSet.setTotal(0);
        options.resultSet.setCount(0);
    },

    readFromIdBuildQuery: function(options, values) {
        values.push(options.params.recordId);
        return [
            'SELECT * FROM ', options.table,
            ' WHERE ', options.idProperty, ' = ?'
        ].join('');
    },

    readMultipleBuildQuery: function(options, values) {

        var ln;
        var i;
        var filter;
        var sorter;
        var property;
        var value;
        var sql = [
            'SELECT * FROM ', options.table
        ].join('');

        // filters
        if (options.params.filters && options.params.filters.length) {
            ln = options.params.filters.length;
            for (i = 0; i < ln; i += 1) {
                filter = options.params.filters[i];
                property = filter.getProperty();
                value = filter.getValue();
                if (property !== null) {
                    sql += [
                        i === 0 ? ' WHERE ' : ' AND ', property,
                        ' ', (filter.getAnyMatch() ? ('LIKE \'%' + value + '%\'') : '= ?')
                    ].join('');
                    if (!filter.getAnyMatch()) {
                        values.push(value);
                    }
                }
            }
        }

        // sorters
        if (options.params.sorters && options.params.sorters.length) {
            ln = options.params.sorters.length;
            for (i = 0; i < ln; i += 1) {
                sorter = options.params.sorters[i];
                property = sorter.getProperty();
                if (property !== null) {
                    sql += [
                        i === 0 ? ' ORDER BY ' : ', ', property, ' ', sorter.getDirection()
                    ].join('');
                }
            }
        }

        // handle start, limit, sort, filter and group params
        if (Ext.isDefined(options.params.page)) {
            sql += [
                ' LIMIT ' + parseInt(options.params.start, 10) + ', ' + parseInt(options.params.limit, 10)
            ].join('');
        }

        return sql;
    },

    readComplete: function(options) {

        if (options.operation.process(options.resultSet) === false) {
            this.fireEvent('exception', this, options.operation);
        }

        if (options.errors) {
            options.operation.setException(options.errors);
        }

        Ext.callback(options.callback, options.scope, [options.operation]);

    },


    /* UPDATE */
    update: function(operation, callback, scope) {

        var options = {
            operation: operation,
            callback: callback || Ext.emptyFn,
            scope: scope || {},
            records: operation.getRecords()
        };

        operation.setStarted();
        this.getDatabaseObject().transaction(
            Ext.bind(this.updateTransaction, this, [options], true),
            Ext.bind(this.transactionError, this, [options], true)
        );

    },

    updateTransaction: function(tx) {

        var args = arguments;
        var options = args[args.length - 1];
        var updatedRecords = [];

        if (!this.tableExists) {
            this.createTable(tx);
        }

        Ext.apply(options, {
            tx: tx,
            idProperty: this.getModel().prototype.getIdProperty(),
            updatedRecords: updatedRecords,
            resultSet: new Ext.data.ResultSet({
                records: updatedRecords,
                success: true
            }),
            table: this.getTableName(),
            columns: this.columns,
            totalRecords: options.records.length,
            executedRecords: 0,
            errors: []
        });

        Ext.each(options.records, Ext.bind(this.updateRecord, this, [options], true));

    },

    updateRecord: function(record, rI, records, options) {

        var id = record.getId();
        var data = this.getRecordData(record);
        var values = this.getColumnValues(options.columns, data);
        var modValues = [];
        var updates = [];
        var col;
        var modifiedKeys = Ext.isObject(record.modified) ? Ext.Object.getKeys(record.modified) : [];
        var modData = {};
        var ln;
        var i;
        var fields = record.getFields();
        var explicitFieldNames = [];
        var field;
        var implicitData = {};
        var implicitChanged = false;

        for (i = 0, ln = options.columns.length; i < ln; i++) {
            col = options.columns[i];
            if (!Ext.Array.contains(modifiedKeys, col)) {
                continue;
            }
            updates.push(col + ' = ?');
            modValues.push(values[i]);
            modData[col] = record.data[col];
        }

        if (this.getImplicitFields()) {
            Ext.each(fields, function(field) {
                explicitFieldNames.push(field.name);
            }, this);
            for (field in record.data) {
                if (Ext.Array.contains(explicitFieldNames, field)) {
                    continue;
                }
                implicitData[field] = record.data[field];
                if (!Ext.Array.contains(modifiedKeys, field)) {
                    continue;
                }
                implicitChanged = true;
                modData[field] = record.data[field];
            }
        }

        if (implicitChanged) {
            updates.push(this.getImplicitFieldsColName() + ' = ?');
            modValues.push(Ext.JSON.encode(implicitData));
        }

        if (!updates.length) {
            this.updateRecordSuccess(options.tx, null, options, record, data, modData);
            return;
        }

        options.tx.executeSql([
                'UPDATE ', options.table,
                ' SET ', updates.join(', '),
                ' WHERE ', options.idProperty, ' = ?'
            ].join(''), modValues.concat(id),
            Ext.bind(this.updateRecordSuccess, this, [options, record, data, modData], true),
            Ext.bind(this.updateRecordError, this, [options, record], true)
        );

    },

    updateRecordSuccess: function(tx, result, options, record, data, modData) {

        var recordId = record.getId();
        var key;
        var model = record.get('model');

        if (this.getCloud() && record.session) {
            for (key in modData) {
                record.session.addOperation({
                    model: model,
                    record_id: recordId,
                    type: 'update',
                    field: key,
                    value: modData[key]
                });
            }
        }

        data = this.decodeRecordData(data);
        options.updatedRecords.push(data);

        options.executedRecords += 1;

        this.updateRecordCallback(options);
    },

    updateRecordError: function(tx, error, options, record) {

        console.error('UPDATE ERROR:', error);

        options.executedRecords += 1;
        options.errors.push({
            clientId: record.getId(),
            error: error
        });

        this.updateRecordCallback(options);

    },

    updateRecordCallback: function(options) {
        if (options.executedRecords === options.totalRecords) {
            this.updateComplete(options);
        }
    },

    updateComplete: function(options) {
        if (options.operation.process(options.resultSet) === false) {
            this.fireEvent('exception', this, options.operation);
        }

        if (options.errors) {
            options.operation.setException(options.errors);
        }

        Ext.callback(options.callback, options.scope, [options.operation]);
    }

});
