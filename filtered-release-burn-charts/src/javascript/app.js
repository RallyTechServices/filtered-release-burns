Ext.define("TSFilteredReleaseBurnChart", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },
    items: [
        {xtype:'container',itemId:'selector_box', layout: 'hbox', defaults: { margin: 10 }},
        {xtype:'container',itemId:'display_box'}
    ],

    integrationHeaders : {
        name : "TSFilteredReleaseBurnup"
    },
    
    config: {
        defaultSettings: {
             filterField: null,
             showBurnDown: false
        }
    },
                        
    launch: function() {
        
        this._getPortfolioItemTypes().then({
            success: function(types) {
                this.bottom_type_path = types[0].get('TypePath');
                
                if ( Ext.isEmpty(this.getSetting('filterField')) ) {
                    Ext.Msg.alert('Configuration Issue',
                        'Use the gear in the upper right to pick Edit App Settings... and set a field to filter on.');
                    return;
                }
                
                this._addSelectors(this.down('#selector_box'));
                this._updateData();
            },
            failure: function(msg) {
                Ext.Msg.alert('Cannot load PI types', msg);
            },
            scope: this
        });

    },
    
    onTimeboxScopeChange: function(timeboxScope){
        this.logger.log('onTimeboxScopeChange',timeboxScope);
        if (timeboxScope && timeboxScope.type === 'release'){
            this.getContext().setTimeboxScope(timeboxScope);
            this._updateData();
        }
    },
    
    _addSelectors: function(container) {
        if (!this._isOnScopedDashboard()) {
            this.timeboxTypePicker = container.add({
                xtype:'rallyreleasecombobox',
                listeners: {
                    select: this._updateData,
                    ready:  this._updateData,
                    scope:  this
                }
            })
        }
        
        if ( this.getSetting('filterField') ) {
            this.fieldValuePicker = container.add({
                xtype: 'rallyfieldvaluecombobox',
                fieldLabel: 'Restrict ' + this.getSetting('filterField') + ' to:',
                labelWidth: 170,
                labelAlign: 'right',
                minWidth: 250,
                value: ['zz'],
                allowClear: false,
                setUseNullForNoEntryValue: true,
                model: this.bottom_type_path,
                field: this.getSetting('filterField'),
                multiSelect: true,
                listeners: {
                    scope: this,
                    blur: this._updateData
                }
            });
        }
    },
    
    _isOnScopedDashboard: function(){
        if (this.getContext().getTimeboxScope() && this.getContext().getTimeboxScope().type === 'release'){
            return true;
        }
        return false;
    },
    
    _getTimeboxRecord: function(){
        var record = null;
        if (this._isOnScopedDashboard()){
            record = this.getContext().getTimeboxScope().getRecord();
        } else {
            record = this.down(this.timeboxTypePicker) && this.down(this.timeboxTypePicker).getRecord();
        }
        return record;
    },
    
    _getTimeboxStartDate: function(){
        var record = this._getTimeboxRecord();
        return record.get('ReleaseStartDate');
    },
    
    _getTimeboxEndDate: function(){
        var record = this._getTimeboxRecord();
        return record.get('ReleaseDate');
    },
    
    _updateData: function() {
        this.release = this._getTimeboxRecord();
        if ( Ext.isEmpty(this.release) ) { return; }
        if ( Ext.isEmpty(this.fieldValuePicker) ) { return; }
        
        this._getReleaseOIDs(this.release).then({
            success: function(oids) {
                this.filterField = this.getSetting('filterField');
                this.filterValues =  this.fieldValuePicker.getValue() || [];
  
                this.releaseObjectIDs = oids;
                
                this._updateChart();
            },
            failure: function(msg) {
                Ext.Msg.alert('Problem Loading Releases:', msg);
            },
            scope: this
        });            
    },
    
    _getReleaseOIDs: function(release) {
        var deferred = Ext.create('Deft.Deferred');
        var release_name = release.get('_refObjectName');
        var config = {
            model: 'Release',
            limit: Infinity,
            filters: [{property:'Name', value: release_name}],
            fetch: ['ObjectID']
        }
        this._loadWsapiRecords(config).then({
            success: function(releases) {
                var oids = Ext.Array.map(releases, function(release) { return release.get('ObjectID'); });
                deferred.resolve(oids);
            },
            failure: function(msg) {
                deferred.reject(msg);
            },
            scope: this
        });
        return deferred.promise;
    },
    
    _updateChart: function() {
        var container = this.down('#display_box');
        container.removeAll();
        
        var show_burn_down = this.getSetting('showBurnDown');
        var calculator_type = 'CA.technicalservices.ReleaseBurnupCalculator';
        if ( show_burn_down ) {
            calculator_type = 'CA.technicalservices.ReleaseBurndownCalculator'
        }
        container.add({
            xtype: 'rallychart',
            chartColors: this._getChartColors(),
            storeType: 'Rally.data.lookback.SnapshotStore',
            storeConfig: this._getStoreConfig(),
            calculatorType: calculator_type,
            calculatorConfig: {
                startDate: this._getTimeboxStartDate(),
                endDate: this._getTimeboxEndDate()
            },
            chartConfig: this._getChartConfig()
        });
    },

    _getChartColors: function() {
        var show_burn_down = this.getSetting('showBurnDown');
        var green = '#5FFB17';
        var black = '#000';
        var blue = '#3BB9FF';
        
        if ( show_burn_down ) {
            return [ green, blue, black];
        }
        return [green,black];
    },
      
    _getStoreConfig: function() {
        
        var find = {
            _TypeHierarchy: {'$in': [this.bottom_type_path]},
            Children: null,
            Release: {'$in': this.releaseObjectIDs}
        }
        
        var values = [];
        Ext.Array.each(this.filterValues, function(value){
            values.push(value);
            if ( Ext.isEmpty(value) ) {
                values.push(null);
            }
        });
        if ( this.filterValues.length > 0 ) {
            find[this.filterField] = { "$in": values };
        }
        
        return {
            find: find,
            fetch: ['LeafStoryPlanEstimateTotal','AcceptedLeafStoryPlanEstimateTotal',this.filterField],
            removeUnauthorizedSnapshots: true,
            sort: {
                _ValidFrom: 1
            },
            context: this.getContext().getDataContext(),
            limit: Infinity
        };
    },
    
    _getChartConfig: function() {
        var show_burn_down = this.getSetting('showBurnDown');
        var title = 'Release Burnup (by ' + this.bottom_type_path + ')';
        if ( show_burn_down ) {
            title = 'Release Burndown (by ' + this.bottom_type_path + ')';
        }
        
        return {
            chart: {
                zoomType: 'xy'
            },
            title: {
                text: title
            },
            xAxis: {
                title: {
                    text: 'Date',
                    margin: 10
                },
                tickmarkPlacement: 'on',
                tickInterval: 7,
                labels: {
                    formatter: function(){
                        var d = new Date(this.value);
                        return Rally.util.DateTime.format(d, 'm/d');
                    }
                }
            },
            yAxis: [
                {
                    title: {
                        text: 'Points'
                    },
                    min: 0
                }
            ],
            plotOptions: {
                series: {
                    marker: {
                        enabled: false,
                        states: {
                            hover: {
                                enabled: true
                            }
                        }
                    },
                    groupPadding: 0.01
                },
                column: {
                    stacking: true,
                    shadow: false
                }
            }
        }
    },
   
    _loadWsapiRecords: function(config){
        var deferred = Ext.create('Deft.Deferred');
        var me = this;
        var default_config = {
            model: 'Defect',
            fetch: ['ObjectID']
        };
        this.logger.log("Starting load:",config.model);
        Ext.create('Rally.data.wsapi.Store', Ext.Object.merge(default_config,config)).load({
            callback : function(records, operation, successful) {
                if (successful){
                    deferred.resolve(records);
                } else {
                    me.logger.log("Failed: ", operation);
                    deferred.reject('Problem loading: ' + operation.error.errors.join('. '));
                }
            }
        });
        return deferred.promise;
    },
    
    getOptions: function() {
        return [
            {
                text: 'About...',
                handler: this._launchInfo,
                scope: this
            }
        ];
    },
    
    _launchInfo: function() {
        if ( this.about_dialog ) { this.about_dialog.destroy(); }
        this.about_dialog = Ext.create('Rally.technicalservices.InfoLink',{});
    },
    
    _getPortfolioItemTypes: function(workspace) {
        var deferred = Ext.create('Deft.Deferred');
                
        var store_config = {
            fetch: ['Name','ElementName','TypePath'],
            model: 'TypeDefinition',
            filters: [
                {
                    property: 'Parent.Name',
                    operator: '=',
                    value: 'Portfolio Item'
                },
                {
                    property: 'Creatable',
                    operator: '=',
                    value: 'true'
                }
            ],
            autoLoad: true,
            listeners: {
                load: function(store, records, successful) {
                    if (successful){
                        deferred.resolve(records);
                    } else {
                        deferred.reject('Failed to load types');
                    }
                }
            }
        };
        
        if ( !Ext.isEmpty(workspace) ) {            
            store_config.context = { 
                project:null,
                workspace: workspace._ref ? workspace._ref : workspace.get('_ref')
            };
        }
                
        var store = Ext.create('Rally.data.wsapi.Store', store_config );
                    
        return deferred.promise;
    },
    
    isExternal: function(){
        return typeof(this.getAppId()) == 'undefined';
    },    

    getSettingsFields: function() {
        var me = this;
        var label_width = 85;
        var margin = 10;
        
        return [{
            name: 'showBurnDown',
            xtype: 'rallycheckboxfield',
            labelWidth: label_width,
            labelAlign: 'left',
            fieldLabel: 'Show Burn Down',
            margin: margin
        },
        {
            name: 'filterField',
            xtype: 'rallyfieldcombobox',
            fieldLabel: 'Filter Field',
            labelWidth: label_width,
            labelAlign: 'left',
            minWidth: 175,
            margin: margin,
            autoExpand: false,
            alwaysExpanded: false,                
            model: this.bottom_type_path,
            _isNotHidden: function(field) {
                if ( field.hidden ) { return false; }
                var defn = field.attributeDefinition;
                if ( Ext.isEmpty(defn) ) { return false; }
                
//                bad_fields = ['TaskStatus','DefectStatus','TestCaseStatus'];
//                if ( Ext.Array.contains(bad_fields, defn.ElementName) ) { return false; }
                
                //console.log('--', defn.Name, defn.Constrained, defn);
                return ( defn.Constrained && ( defn.AttributeType == 'STRING' || defn.AttributeType == 'RATING' ));
            }
        }];
    }
    
});
