Ext.define('DBProxies.overrides.data.proxy.sql.Read', {
    override: 'DBProxies.data.proxy.Sql',

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

    },

    readQuerySuccess: function(tx, result, options) {

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

    }

});
