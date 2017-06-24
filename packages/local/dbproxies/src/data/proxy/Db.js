/**
 * Db proxy is a superclass for the {@link DBProxies.data.proxy.IndexedDB IndexedDB} and {@link DBProxies.data.proxy.Sql
 * Sql} proxies.
 * @private
 */
Ext.define('DBProxies.data.proxy.Db', {
    extend: 'Ext.data.proxy.Client',

    config: {
        /**
         * @cfg {Boolean} cloud
         * Whether or not to store local operations in the session's local operations store for upload to the cloud.
         * This probably means nothing to you if you are not using the cloud system that is compatible with these
         * proxies
         */
        cloud: false,

        /**
         * @cfg {Boolean} implicitFields
         * Whether or not to also save implicit fields on a record. Implicit fields are were a field that was not
         * explicitly defined in the model's fields config has been set on the record
         */
        implicitFields: false
    },
    
    /**
     * @cfg {Object} reader
     * Not used by db proxies
     * @hide
     */

    /**
     * @cfg {Object} writer
     * Not used by db proxies
     * @hide
     */

    setException: function(operation, error) {

        operation.setException(error);

    }
    
});
