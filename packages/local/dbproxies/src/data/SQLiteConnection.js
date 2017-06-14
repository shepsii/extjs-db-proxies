Ext.define('DBProxies.data.SQLiteConnection', {
    singleton: true,

    getConn: function() {
        if (!Ext.isDefined(this.conn)) {
            if (window.sqlitePlugin) {
                this.conn = window.sqlitePlugin.openDatabase({
                    name: (window.FBG ? FBG.Config.dbName : 'extjs') + '.db',
                    location: 'default'
                });
            } else {
                this.conn = window.openDatabase(
                    (window.FBG ? FBG.Config.dbName : 'extjs'),
                    (window.FBG ? FBG.Config.dbVersion : '1.0')
                    (window.FBG ? FBG.Config.dbDescription : 'extjs')
                    (window.FBG ? FBG.Config.dbSize : 5000000)
                );
            }

        }
        return this.conn;
    }

});
