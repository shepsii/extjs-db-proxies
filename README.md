# extjs-db-proxies
WebSQL/SQLite, IndexedDB and dynamic proxies for ExtJS

sql proxy: dynamically switches to websql or sqlite if the cordova plugin is found
indexeddb: tested in chrome, safari and firefox. IE testing to come (although openCursor in place of getAll is working)
dynamic: will automatically select sql or indexeddb, in the order you specify, based on support

--HOW TO USE--

If you are a git guru, you may know how to clone only the package from this repository into an application's packages/local directory.

If I just described you, please let me know how to do that so I can update these instructions accordingly!

Otherwise...

1. Add the dependency to your app's package.json file:
```
"dependencies": {
    "extjs-db-proxies": "git+ssh://git@github.com/shepsii/extjs-db-proxies.git"
  }
```
2. run `npm install` (you will need nodejs installed)
3. create a symlink in packages/local (this works for linux/mac; windows guys you'll need to work this one out on your own)
```
cd packages/local;
ln -s ../node_modules/extjs-db-proxies/packages/local/dbproxies dbproxies
```
4. Add to the requires in your app.json:
```
"requires": [
        "dbproxies"
]
```
(4b. if you have any other packages that need to use the proxies, they will also need to require the package)

5. Require in the proxy you need from a model or store class, and set the proxy using e.g. `type: 'sql'` or see below for an example of the use of the dynamic proxy:
```
Ext.define('MyApp.model.Person', {
    extend: 'Ext.data.Model',

    requires: [
        'DBProxies.data.proxy.Sql',
        ...
    ],
    proxy: {
        type: 'dynamic',
        allConfig: {
            cloud: false
        },
        proxies: [
            {
                type: 'sql'
            },
            {
                type: 'indexeddb'
            }
        ]
    },
    ...
```
6. Optionally, override the DBProxies.config.Config class to change the database name, description and size, e.g.:
```
Ext.define('MyApp.overrides.dbproxies.Config', {
    override: 'DBProxies.config.Config',

    dbName: 'myappdb',
    dbDescription: 'This is my db description',
    dbVersion: '1.0',
    dbSize: 5000000
    
});
```
You should then be good to go - if not, throw out a `sencha app refresh` and then try another `sencha app watch`. Before you go crazy on these, make sure a `sencha app build` works too.

Please feel free to fork and pull request any changes.
