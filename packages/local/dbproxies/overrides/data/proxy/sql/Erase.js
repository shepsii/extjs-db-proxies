Ext.define('DBProxies.overrides.data.proxy.sql.Erase', {
    override: 'DBProxies.data.proxy.Sql',

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
        var tableExists = this.getTableExists();

        if (!tableExists) {
            this.createTable(tx);
        }
        
        Ext.apply(options, {
            tx: tx,
            idProperty: this.getModel().prototype.getIdProperty(),
            table: this.getTable(),
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
    }

});
