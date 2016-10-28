Ext.define("TSFilteredReleaseBurnup", {
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
             filterField: null
        }
    },
                        
    launch: function() {

        this._addSelectors(this.down('#selector_box'));
        this._updateData();
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
                    ready: this._updateData,
                    scope: this
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
                allowClear: true,
                setUseNullForNoEntryValue: true,
                model: 'HierarchicalRequirement',
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
        
        this._getReleaseOIDs(this.release).then({
            success: function(oids) {
                this.filterField = this.getSetting('filterField');
                this.filterValues = this.fieldValuePicker.getValue() || [];
  
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
        
        container.add({
            xtype: 'rallychart',
            chartColors: this._getChartColors(),
            storeType: 'Rally.data.lookback.SnapshotStore',
            storeConfig: this._getStoreConfig(),
            calculatorType: 'CA.technicalservices.ReleaseBurnupCalculator',
            calculatorConfig: {
                startDate: this._getTimeboxStartDate(),
                endDate: this._getTimeboxEndDate()
            },
            chartConfig: this._getChartConfig()
        });
    },

    _getChartColors: function() {
        return ['#006200','#000'];
    },
      
    _getStoreConfig: function() {
        var find = {
            _TypeHierarchy: {'$in': ['Defect','HierarchicalRequirement']},
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
            fetch: ['ScheduleState','PlanEstimate',this.filterField,'AcceptedDate'],
            removeUnauthorizedSnapshots: true,
            sort: {
                _ValidFrom: 1
            },
            context: this.getContext().getDataContext(),
            limit: Infinity
        };
    },
    
    _getChartConfig: function() {
        return {
            chart: {
                zoomType: 'xy'
            },
            title: {
                text: 'Release Burnup'
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
    
    isExternal: function(){
        return typeof(this.getAppId()) == 'undefined';
    },    

    getSettingsFields: function() {
        var me = this;
        
        return [{
            name: 'filterField',
            xtype: 'rallyfieldcombobox',
            fieldLabel: 'Filter Field',
            labelWidth: 125,
            labelAlign: 'left',
            minWidth: 200,
            margin: '10 10 10 10',
            autoExpand: false,
            alwaysExpanded: false,                
            model: 'HierarchicalRequirement',
            _isNotHidden: function(field) {
                if ( field.hidden ) { return false; }
                var defn = field.attributeDefinition;
                if ( Ext.isEmpty(defn) ) { return false; }
                
                bad_fields = ['TaskStatus','DefectStatus','TestCaseStatus'];
                if ( Ext.Array.contains(bad_fields, defn.ElementName) ) { return false; }
                
                return ( defn.Constrained && defn.AttributeType == 'STRING' );
            }
        }];
    }
    
});
