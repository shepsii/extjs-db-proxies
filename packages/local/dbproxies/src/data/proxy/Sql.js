Ext.define('DBProxies.data.proxy.Sql', {
    alias: 'proxy.sql',
    extend: 'Ext.data.proxy.Client',
    alternateClassName: 'Ext.data.proxy.SQL',

    requires: [
        'DBProxies.data.SQLiteConnection'
    ],
    
    isSQLProxy: true,

    config: {
        table: null,
        implicitTable: null,
        columns: '',
        tableExists: false,
        defaultDateFormat: 'Y-m-d H:i:s.u',
        cloud: true,
        implicitFields: false,
        implicitFieldsColName: 'implicit'
    },

    getDatabaseObject: function() {
        return DBProxies.data.SQLiteConnection.getConn();
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

            if (!this.getTable()) {
                this.setTable(table);
            }

            this.setColumns(this.getPersistedModelColumns(model));
        }

        this.callParent(arguments);
        
    },

    setException: function(operation, error) {
        
        operation.setException(error);
        
    },

    createTable: function(transaction) {
        
        transaction.executeSql([
            'CREATE TABLE IF NOT EXISTS ',
            this.getTable(),
            ' (', this.getSchemaString(), ')'
        ].join(''));
        this.setTableExists(true);
        
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
        var table = me.getTable();
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

        me.setTableExists(false);

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
    }

});
