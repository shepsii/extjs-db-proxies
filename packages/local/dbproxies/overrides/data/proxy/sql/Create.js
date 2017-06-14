Ext.define('DBProxies.overrides.data.proxy.sql.Create', {
    override: 'DBProxies.data.proxy.Sql',

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
        var tableExists = this.getTableExists();
        var tmp = [];
        var i;
        var ln;
        var placeholders;

        if (!tableExists) {
            this.createTable(tx);
        }

        for (i = 0, ln = this.getColumns().length; i < ln; i++) {
            tmp.push('?');
        }
        placeholders = tmp.join(', ');

        Ext.apply(options, {
            tx: tx,
            resultSet: new Ext.data.ResultSet({
                success: true
            }),
            table: this.getTable(),
            columns: this.getColumns(),
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

    }

});
