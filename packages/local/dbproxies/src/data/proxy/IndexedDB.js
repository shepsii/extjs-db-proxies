Ext.define('DBProxies.data.proxy.IndexedDB', {
    alias: 'proxy.indexeddb',
    extend: 'DBProxies.data.proxy.Db',

    isIndexedDBProxy: true,

    config: {
        db: false,
        dbName: null,
        idProperty: false,
        cloud: false,
        indices: [],
        implicitFields: false
    },

    updateModel: function(model) {

        var modelName;
        var dbName;

        if (model) {
            modelName = model.prototype.entityName;
            dbName = modelName.slice(modelName.lastIndexOf('.') + 1);
            if (!this.getDbName()) {
                this.setDbName(dbName);
            }
            this.setIdProperty(model.prototype.getIdProperty());

            /* todo: apply the indices */
        }

        this.callParent(arguments);

    },

    deleteDb: function(callback, scope) {
        this.ensureDb({}, function() {
            indexedDB.deleteDatabase(this.getDbName());
            Ext.callback(callback, scope);
        }, this);
    },

    ensureDb: function(options, callback, scope) {
        if (this.getDb()) {
            Ext.callback(callback, scope);
            return;
        }
        var request = indexedDB.open(this.getDbName(), 1);
        request.onsuccess = Ext.bind(this.openDbSuccess, this, [request, callback, scope], false);
        request.onerror = Ext.bind(this.openDbError, this, [options, callback, scope], true);
        request.onupgradeneeded = Ext.bind(this.openDbSetSchema, this, [request, callback, scope], false);
    },

    openDbSuccess: function(request, callback, scope) {
        this.setDb(request.result);
        Ext.callback(callback, scope);
    },

    openDbError: function(err) {
        var args = arguments;
        var options = args[args.length - 3];
        console.error('open indexeddb error: ', err.target.error);
        Ext.callback(options.callback, options.scope, [false, 'indexed db open error: ' + err.target.error]);
    },

    openDbSetSchema: function(request) {
        var store = request.result.createObjectStore(this.getDbName(), {keyPath: this.getIdProperty()});
    },

    getDbTx: function(type, options, callbackArg, scopeArg) {
        var callback = callbackArg || Ext.emptyFn;
        var scope = scopeArg || {};
        this.ensureDb(options, Ext.bind(this.getDbTxWithDb, this, [type, options, callback, scope], false));
    },

    getDbTxWithDb: function(type, options, callback, scope) {
        var tx = this.getDb().transaction([this.getDbName()], type);
        tx.onerror = Ext.bind(this.transactionError, this, [options], true);
        Ext.callback(callback, scope, [tx]);
    },

    transactionError: function(err, options) {
        var args = arguments;
        console.error('indexeddb proxy transaction error: ', err.target.error);
        this.setException(options.operation, err.target.error);
        if (options.callback) {
            Ext.callback(options.callback, options.scope, [options.operation]);
        }
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
            name = field.name;
            explicitFieldNames.push(name);
            if (!Ext.isDefined(field.persist) || field.persist) {
                data[name] = record.get(name);
            }

        }, this);

        if (this.getImplicitFields()) {
            for (field in record.data) {
                if (!Ext.Array.contains(explicitFieldNames, field)) {
                    data[field] = record.data[field];
                }
            }
        }

        return data;
    },


    /* CREATE */
    create: function(operation) {

        var options = {
            operation: operation,
            records: operation.getRecords()
        };
        operation.setStarted();
        this.getDbTx('readwrite', options, Ext.bind(this.createTransaction, this, [options], true));

    },

    createTransaction: function(tx) {

        var args = arguments;
        var options = args[args.length - 1];

        Ext.apply(options, {
            tx: tx,
            object_store: tx.objectStore(this.getDbName()),
            resultSet: new Ext.data.ResultSet({
                success: true
            }),
            totalRecords: options.records.length,
            executedRecords: 0,
            errors: []
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
        var request = options.object_store.add(data);
        request.onsuccess = Ext.bind(this.createRecordSuccess, this, [options, record, data], true);
        request.onerror = Ext.bind(this.createRecordError, this, [options, record], true);

    },

    createRecordSuccess: function(evt, options, record, data) {

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

    createRecordError: function(error, options, record) {

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
        this.getDbTx('readwrite', options, Ext.bind(this.eraseTransaction, this, [options], true));

    },

    eraseTransaction: function(tx) {

        var args = arguments;
        var options = args[args.length - 1];

        tx.oncomplete = Ext.bind(this.eraseTransactionSuccess, this, [options], true);

        Ext.apply(options, {
            tx: tx,
            object_store: tx.objectStore(this.getDbName()),
            errors: []
        });

        Ext.each(options.records, Ext.bind(this.eraseRecord, this, [options], true));

    },

    eraseRecord: function(record, i, records, options) {
        var request = options.object_store.delete(record.getId());
        request.onsuccess = Ext.bind(this.eraseRecordSuccess, this, [options, record], true);
        request.onerror = Ext.bind(this.eraseRecordError, this, [options, record], true);
    },

    eraseRecordSuccess: function(tx, options, record) {

        if (this.getCloud() && record.session) {
            record.session.addOperation({
                model: record.get('model'),
                record_id: record.getId(),
                type: 'delete'
            });
        }

        options.erasedRecords.push(record);

    },

    eraseRecordError: function(err, options, record) {

        console.error('ERASE ERROR:', err.target.error);

        options.errors.push({
            clientId: record.getId(),
            error: err.target.error
        });

    },

    eraseTransactionSuccess: function() {
        var args = arguments;
        var options = args[args.length - 1];

        if (options.operation.process(options.resultSet) === false) {
            this.fireEvent('exception', this, options.operation);
        }

        if (options.errors.length) {
            options.operation.setException(options.errors.join(', '));
        }

        Ext.callback(options.callback, options.scope, [options.operation]);
    },


    /* READ */
    read: function(operation, callback, scope) {
        /*
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
         */
    },

    readTransaction: function(tx) {
        /*
         var args = arguments;
         var options = args[args.length - 1];
         var tableExists = this.getTableExists();
         var records = [];
         var values = [];
         var sql;
         var params = options.operation.getParams() || {};

         if (!tableExists) {
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
         table: this.getTable(),
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
         */
    },

    readQuerySuccess: function(tx, result, options) {
        /*
         var rows = result.rows;
         var count = rows.length;
         var i;
         var ln;
         var data;
         var model = this.getModel();

         for (i = 0, ln = count; i < ln; i++) {
         data = this.decodeRecordData(rows.item(i));
         options.records.push(Ext.isFunction(options.recordCreator) ?
         options.recordCreator(data, model) :
         new model(data));
         }

         options.resultSet.setSuccess(true);
         options.resultSet.setTotal(count);
         options.resultSet.setCount(count);

         this.readComplete(options);
         */
    },

    readQueryError: function(tx, errors, options) {
        /*
         console.error('READ ERROR:', errors);
         options.errors.push(errors);

         options.resultSet.setSuccess(false);
         options.resultSet.setTotal(0);
         options.resultSet.setCount(0);
         */
    },

    readFromIdBuildQuery: function(options, values) {
        /*
         values.push(options.params.recordId);
         return [
         'SELECT * FROM ', options.table,
         ' WHERE ', options.idProperty, ' = ?'
         ].join('');
         */
    },

    readMultipleBuildQuery: function(options, values) {
        /*
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
         */
    },

    readComplete: function(options) {
        /*
         if (options.operation.process(options.resultSet) === false) {
         this.fireEvent('exception', this, options.operation);
         }

         if (options.errors) {
         options.operation.setException(options.errors);
         }

         Ext.callback(options.callback, options.scope, [options.operation]);
         */
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

        this.getDbTx('readwrite', options, Ext.bind(this.updateTransaction, this, [options], true));

    },

    updateTransaction: function(tx) {

        var args = arguments;
        var options = args[args.length - 1];
        var updatedRecords = [];

        Ext.apply(options, {
            tx: tx,
            object_store: tx.objectStore(this.getDbName()),
            updatedRecords: updatedRecords,
            resultSet: new Ext.data.ResultSet({
                records: updatedRecords,
                success: true
            }),
            totalRecords: options.records.length,
            executedRecords: 0,
            errors: []
        });

        Ext.each(options.records, Ext.bind(this.updateRecord, this, [options], true));

    },

    updateRecord: function(record, rI, records, options) {

        var id = record.getId();
        var data = this.getRecordData(record);
        var request = options.object_store.put(data);
        var modData = {};
        var modifiedKeys = Ext.isObject(record.modified) ? Ext.Object.getKeys(record.modified) : [];

        Ext.each(modifiedKeys, function(key) {
            if (Ext.isDefined(data[key])) {
                modData[key] = data[key];
            }
        }, this);
        request.onsuccess = Ext.bind(this.updateRecordSuccess, this, [options, record, data, modData], true);
        request.onerror = Ext.bind(this.updateRecordError, this, [options, record], true);

    },

    updateRecordSuccess: function(evt, options, record, data, modData) {

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

        options.updatedRecords.push(data);

        options.executedRecords += 1;

        this.updateRecordCallback(options);

    },

    updateRecordError: function(err, options, record) {

        console.error('UPDATE ERROR:', err.target.error);

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
