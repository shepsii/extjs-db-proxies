Ext.define('DBProxies.data.SQLiteConnection', {
    singleton: true,
    
    requires: [
        'DBProxies.config.Config'
    ],

    getConn: function() {
        if (!Ext.isDefined(this.conn)) {
            if (window.sqlitePlugin) {
                this.conn = window.sqlitePlugin.openDatabase({
                    name: DBProxies.config.Config.dbName + '.db',
                    location: 'default'
                });
            } else {
                this.conn = window.openDatabase(
                    DBProxies.config.Config.dbName,
                    DBProxies.config.Config.dbVersion,
                    DBProxies.config.Config.dbDescription,
                    DBProxies.config.Config.dbSize
                );
            }

        }
        return this.conn;
    }

});
