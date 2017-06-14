Ext.define('DBProxies.overrides.data.proxy.sql.Update', {
    override: 'DBProxies.data.proxy.Sql',

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
        var tableExists = this.getTableExists();
        var updatedRecords = [];

        if (!tableExists) {
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
            table: this.getTable(),
            columns: this.getColumns(),
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
