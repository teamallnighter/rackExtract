// Rack Workflow Extractor for AI Training Data
// Based on M4L.chooser.js by Jeremy Bernstein (Cycling '74)
// Adapted for recursive device chain extraction and JSON export
// Single M4L JavaScript file - no Node.js or V8 communication needed

autowatch = 1;
inlets = 1;
outlets = 1;

// Workflow extraction types - simplified from chooser MenuTypes
var WorkflowTypes = {
    device: { container: ["devices"], filterfun: extract_device_workflow },
    chain: { container: ["chains"], filterfun: extract_chain_workflow },
    parameter: { container: ["parameters"] }
};

var Root = "live_set";
var ExtractorAPI = null;
var WorkflowData = null;

// Recursive API management - reused from chooser
var TempRecursiveAPI = new Array();
var TempRecursiveAPILevel = 0;

/////////////////////////////////////////
// MAIN WORKFLOW EXTRACTION FUNCTIONS

// Extract workflow from specific track and device
function extract_workflow_internal(trackID, deviceID) {
    post("=== RACK WORKFLOW EXTRACTOR ===\n");
    post("Extracting workflow from track " + trackID + ", device " + deviceID + "\n");

    try {
        // Build path to target device
        var devicePath = Root + " tracks " + trackID + " devices " + deviceID;
        post("Target device path: " + devicePath + "\n");

        // Initialize workflow data structure
        WorkflowData = {
            metadata: {
                extracted_at: new Date().toISOString(),
                track_id: trackID,
                device_id: deviceID,
                extractor_version: "1.0"
            },
            workflow: {
                root_device: null,
                devices: [],
                chains: [],
                parameters: [],
                connections: []
            }
        };

        // Create API for target device
        var deviceAPI = new WorkflowAPIMenu(WorkflowTypes.device, devicePath);
        if (!deviceAPI) {
            post("ERROR: Could not access device at " + devicePath + "\n");
            return;
        }

        // Get root device info
        var rootDeviceName = get_safe_name(deviceAPI);
        var deviceType = get_device_type(deviceAPI);
        var deviceClass = deviceAPI.get("class_name");
        var visibleMacros = deviceAPI.get("visible_macro_count");
        var variationCount = deviceAPI.get("variation_count");

        post("Found root device: " + rootDeviceName + " (class: " + deviceClass + ")\n");
        post("Device type: " + deviceType + ", macros: " + visibleMacros + ", variations: " + variationCount + "\n");

        // Filter out any 5e-324 corrupted values from root device properties
        var cleanedRootDevice = {
            name: rootDeviceName,
            path: devicePath,
            type: deviceType,
            class_name: filter_5e324_value(deviceClass),
            visible_macro_count: filter_5e324_value(visibleMacros),
            variation_count: filter_5e324_value(variationCount),
            macros: extract_device_parameters(deviceAPI)  // Root device params are MACROS
        };

        // Remove any properties with 5e-324 values
        WorkflowData.workflow.root_device = filter_object_5e324(cleanedRootDevice);

        // Check if device has chains (is a rack)
        var children = deviceAPI.children;
        if (children && children.join(" ").match(/\s+?chains\s+/)) {
            post("Device has chains - extracting recursive workflow...\n");
            extract_recursive_chains(deviceAPI, devicePath, 0);
        } else {
            post("Device has no chains - simple device workflow\n");
        }

        // Export workflow as JSON
        export_workflow_json();

    } catch (error) {
        post("ERROR in extract_workflow: " + error + "\n");
    }
}

// Recursively extract all chains and nested devices
function extract_recursive_chains(api, basePath, depth) {
    try {
        var target = dequote(basePath);
        var spacing = "";
        for (var i = 0; i < depth; i++) {
            spacing += "  ";
        }

        post(spacing + "Extracting chains from: " + target + "\n");

        // Create recursive API for chains
        var chainsAPI = new RecursiveWorkflowAPI(WorkflowTypes.chain, target);
        if (!chainsAPI) return;

        // Get chain count
        var chainCount = chainsAPI.getcount("chains");
        post(spacing + "Found " + chainCount + " chains\n");

        for (var i = 0; i < chainCount; i++) {
            var chainPath = target + " chains " + i;
            chainsAPI.path = chainPath;

            var chainInfo = {
                chain_id: i,
                path: chainPath,
                depth: depth,
                devices: []
            };

            // Extract devices in this chain
            extract_chain_devices(chainsAPI, chainPath, chainInfo, depth + 1);

            WorkflowData.workflow.chains.push(chainInfo);
        }

        RecursiveWorkflowAPIDispose(chainsAPI);

    } catch (error) {
        post("ERROR in extract_recursive_chains: " + error + "\n");
    }
}

// Extract devices within a specific chain
function extract_chain_devices(api, chainPath, chainInfo, depth) {
    try {
        var spacing = "";
        for (var i = 0; i < depth; i++) {
            spacing += "  ";
        }

        api.path = chainPath;
        var deviceCount = api.getcount("devices");
        post(spacing + "Chain has " + deviceCount + " devices\n");

        for (var i = 0; i < deviceCount; i++) {
            var devicePath = chainPath + " devices " + i;
            api.path = devicePath;

            var deviceName = get_safe_name(api);
            post(spacing + "- Device " + i + ": " + deviceName + "\n");

            var deviceInfo = {
                device_id: i,
                name: deviceName,
                path: devicePath,
                depth: depth,
                type: get_device_type(api),
                parameters: extract_device_parameters(api)
            };

            // Filter out any 5e-324 values from device info
            deviceInfo = filter_object_5e324(deviceInfo);

            chainInfo.devices.push(deviceInfo);
            WorkflowData.workflow.devices.push(deviceInfo);

            // Check if this device also has chains (nested racks)
            var children = api.children;
            if (children && children.join(" ").match(/\s+?chains\s+/)) {
                post(spacing + "  Nested rack detected - going deeper...\n");
                extract_recursive_chains(api, devicePath, depth + 1);
            }
        }

    } catch (error) {
        post("ERROR in extract_chain_devices: " + error + "\n");
    }
}

// Extract all parameters for a device
function extract_device_parameters(api) {
    try {
        var parameters = [];
        var basePath = api.path;

        // Remove quotes from path
        var cleanPath = dequote(basePath);

        // Create separate API instance for parameter access
        var paramAPI = new LiveAPI();
        var paramCount = api.getcount("parameters");

        post("    Extracting " + paramCount + " parameters from: " + cleanPath + "\n");

        for (var i = 0; i < paramCount; i++) {
            // Build direct path to parameter
            var paramPath = cleanPath + " parameters " + i;

            try {
                paramAPI.path = paramPath;

                // Get parameter properties directly
                var paramName = paramAPI.get("name");
                var paramValue = paramAPI.get("value");
                var paramDisplayValue = paramAPI.get("display_value");
                var paramDefaultValue = paramAPI.get("default_value");
                var paramMin = paramAPI.get("min");
                var paramMax = paramAPI.get("max");
                var paramQuantized = paramAPI.get("is_quantized");

                // Filter out corrupted parameters - ANY 5e-324 value means skip this parameter
                var isCorrupted = is_5e324_value(paramName) ||
                    is_5e324_value(paramValue) ||
                    is_5e324_value(paramDisplayValue) ||
                    is_5e324_value(paramDefaultValue) ||
                    is_5e324_value(paramMin) ||
                    is_5e324_value(paramMax) ||
                    paramName === null ||
                    paramName === undefined ||
                    paramName === "" ||
                    paramName === "unnamed";

                // ONLY include parameters with valid, non-corrupted values
                if (!isCorrupted && paramName) {
                    var paramInfo = {
                        parameter_id: i,
                        name: String(paramName),
                        value: paramValue,
                        display_value: paramDisplayValue,
                        default_value: paramDefaultValue,
                        min: paramMin,
                        max: paramMax,
                        is_quantized: paramQuantized
                    };

                    // Final filter of the parameter object itself
                    paramInfo = filter_object_5e324(paramInfo);

                    parameters.push(paramInfo);
                    post("      Param " + i + ": " + paramName + " = " + paramValue + " (display: " + paramDisplayValue + ")\n");
                } else {
                    post("      Param " + i + ": skipped (corrupted - name: " + paramName + ", value: " + paramValue + ")\n");
                }
            } catch (paramError) {
                post("      Param " + i + ": error - " + paramError + "\n");
            }
        }

        post("    Successfully extracted " + parameters.length + " valid parameters\n");
        return parameters;
    } catch (error) {
        post("ERROR in extract_device_parameters: " + error + "\n");
        return [];
    }
}

/////////////////////////////////////////
// UTILITY FUNCTIONS (adapted from chooser)

// Check if a value is the corrupted 5e-324 indicator
function is_5e324_value(value) {
    if (value === null || value === undefined) return false;

    // Check for exact numeric match
    if (value === 5e-324) return true;

    // Check for string representation
    var stringValue = String(value);
    return (stringValue === "5e-324" ||
        stringValue === "5e-324" ||
        stringValue.indexOf("5e-324") !== -1);
}

// Filter a single value, return null if it's 5e-324
function filter_5e324_value(value) {
    return is_5e324_value(value) ? null : value;
}

// Recursively filter all 5e-324 values from an object
function filter_object_5e324(obj) {
    if (!obj || typeof obj !== 'object') return obj;

    var filtered = {};

    for (var key in obj) {
        if (obj.hasOwnProperty(key)) {
            var value = obj[key];

            // Skip keys that have 5e-324 values
            if (is_5e324_value(value)) {
                post("        Filtered out " + key + " (5e-324 corruption)\n");
                continue;
            }

            // Recursively filter arrays
            if (Array.isArray(value)) {
                var filteredArray = [];
                for (var i = 0; i < value.length; i++) {
                    var arrayItem = value[i];
                    if (!is_5e324_value(arrayItem)) {
                        if (typeof arrayItem === 'object') {
                            filteredArray.push(filter_object_5e324(arrayItem));
                        } else {
                            filteredArray.push(arrayItem);
                        }
                    }
                }
                filtered[key] = filteredArray;
            }
            // Recursively filter objects
            else if (typeof value === 'object' && value !== null) {
                filtered[key] = filter_object_5e324(value);
            }
            // Keep non-corrupted primitive values
            else {
                filtered[key] = value;
            }
        }
    }

    return filtered;
}

function get_safe_name(api) {
    try {
        var name = api.get("name");
        if (name == "" || name == undefined || !name) {
            name = "unnamed";
        }
        // Handle array return values
        if (Array.isArray(name)) {
            return name.length > 0 ? name[0] : "unnamed";
        }
        return String(name);
    } catch (error) {
        return "unnamed";
    }
}

function get_device_type(api) {
    try {
        // Try to determine device type
        var children = api.children;
        if (children && children.join(" ").match(/\s+?chains\s+/)) {
            return "rack";
        }
        return "device";
    } catch (error) {
        return "unknown";
    }
}

function dequote(string) {
    return string.replace(/\"/g, "");
}

// Export workflow data as JSON
function export_workflow_json() {
    try {
        post("=== WORKFLOW EXTRACTION COMPLETE ===\n");

        // Handle both device and chain extractions
        var rootName = "unknown";
        if (WorkflowData.workflow.root_device) {
            rootName = WorkflowData.workflow.root_device.name;
            post("Root device: " + rootName + "\n");
        } else if (WorkflowData.workflow.root_chain) {
            rootName = WorkflowData.workflow.root_chain.name;
            post("Root chain: " + rootName + "\n");
        }

        post("Total devices found: " + WorkflowData.workflow.devices.length + "\n");
        post("Total chains found: " + WorkflowData.workflow.chains.length + "\n");

        // Output JSON via outlet
        var jsonString = JSON.stringify(WorkflowData, null, 2);
        outlet(0, "workflow_json", jsonString);

        // Also post abbreviated version to Max window
        post("JSON Export (first 500 chars):\n");
        post(jsonString.substring(0, 500) + "...\n");

    } catch (error) {
        post("ERROR in export_workflow_json: " + error + "\n");
    }
}

/////////////////////////////////////////
// RECURSIVE API MANAGEMENT (from chooser)

function RecursiveWorkflowAPI(type, path) {
    var api;

    if (TempRecursiveAPILevel < TempRecursiveAPI.length) {
        api = TempRecursiveAPI[TempRecursiveAPILevel];
    } else {
        api = new LiveAPI();
        TempRecursiveAPI[TempRecursiveAPILevel] = api;
    }
    TempRecursiveAPILevel++;

    if (api) {
        var id = /^id (\d+)$/.exec(path);
        if (id) {
            api.id = parseInt(id[1]);
        } else {
            api.path = path;
        }
        api.wtype = type;
    }
    return api;
}

function RecursiveWorkflowAPIDispose(api) {
    if (TempRecursiveAPILevel <= 0) return;

    if (TempRecursiveAPI[TempRecursiveAPILevel - 1] == api) {
        api.id = 0;
        api.wtype = null;
        TempRecursiveAPILevel--;
    }
}

function WorkflowAPIMenu(type, path) {
    var api = new LiveAPI();

    if (api) {
        var id = /^id (\d+)$/.exec(path);
        if (id) {
            api.id = parseInt(id[1]);
        } else {
            api.path = path;
        }
        api.wtype = type;
    }
    return api;
}

/////////////////////////////////////////
// FILTER FUNCTIONS (simplified from chooser)

function extract_device_workflow(api) {
    // This replaces the menu-building filter with data extraction
    return true;
}

function extract_chain_workflow(api) {
    // This replaces the menu-building filter with data extraction  
    return true;
}

/////////////////////////////////////////
// USER INTERFACE

// Extract from specific chain path (like extract_workflow 1 0 0)
function extract_chain(trackID, deviceID, chainID) {
    post("=== EXTRACTING FROM CHAIN ===\n");
    post("Extracting from track " + trackID + ", device " + deviceID + ", chain " + chainID + "\n");

    try {
        // Build path to target chain
        var chainPath = Root + " tracks " + trackID + " devices " + deviceID + " chains " + chainID;
        post("Target chain path: " + chainPath + "\n");

        // Initialize workflow data structure
        WorkflowData = {
            metadata: {
                extracted_at: new Date().toISOString(),
                track_id: trackID,
                device_id: deviceID,
                chain_id: chainID,
                extractor_version: "1.0"
            },
            workflow: {
                root_chain: null,
                devices: [],
                chains: [],
                parameters: [],
                connections: []
            }
        };

        // Create API for target chain
        var chainAPI = new WorkflowAPIMenu(WorkflowTypes.chain, chainPath);
        if (!chainAPI) {
            post("ERROR: Could not access chain at " + chainPath + "\n");
            return;
        }

        // Get chain info
        chainAPI.path = chainPath;
        var chainName = get_safe_name(chainAPI) || ("Chain " + chainID);
        post("Found chain: " + chainName + "\n");

        WorkflowData.workflow.root_chain = {
            chain_id: chainID,
            name: chainName,
            path: chainPath,
            devices: []
        };

        // Extract devices in this chain
        var deviceCount = chainAPI.getcount("devices");
        post("Chain has " + deviceCount + " devices\n");

        for (var i = 0; i < deviceCount; i++) {
            var devicePath = chainPath + " devices " + i;
            chainAPI.path = devicePath;

            var deviceName = get_safe_name(chainAPI);
            post("- Device " + i + ": " + deviceName + "\n");

            var deviceInfo = {
                device_id: i,
                name: deviceName,
                path: devicePath,
                type: get_device_type(chainAPI),
                parameters: extract_device_parameters(chainAPI)
            };

            // Filter out any 5e-324 values from device info
            deviceInfo = filter_object_5e324(deviceInfo);

            WorkflowData.workflow.root_chain.devices.push(deviceInfo);
            WorkflowData.workflow.devices.push(deviceInfo);

            // Check for nested chains
            var children = chainAPI.children;
            if (children && children.join(" ").match(/\s+?chains\s+/)) {
                post("  Device has nested chains - extracting...\n");
                extract_recursive_chains(chainAPI, devicePath, 1);
            }
        }

        // Export workflow as JSON
        export_workflow_json();

    } catch (error) {
        post("ERROR in extract_chain: " + error + "\n");
    }
}

// Main function - extract workflow from Metal Head device
function extract_metal_head() {
    extract_workflow_internal(1, 0);  // trackID:1, deviceID:0 for "Metal Head"
}

// Main function - extract first chain from Metal Head device  
function extract_metal_head_chain() {
    extract_chain(1, 0, 0);  // trackID:1, deviceID:0, chainID:0 for first chain
}

// Main function - extract EZFREQSPLIT device (simpler test case)
function extract_ezfreqsplit() {
    extract_workflow_internal(1, 1);  // trackID:1, deviceID:1 for "EZFREQSPLIT"
}

// Extract first chain from EZFREQSPLIT (should be LOWS-CHAIN)
function extract_ezfreqsplit_chain() {
    extract_chain(1, 1, 0);  // trackID:1, deviceID:1, chainID:0
}

// Generic extraction function
function extract(trackID, deviceID) {
    if (arguments.length < 2) {
        post("Usage: extract <trackID> <deviceID>\n");
        post("Example: extract 1 0\n");
        return;
    }
    extract_workflow_internal(trackID, deviceID);
}

// Alternative function names for easier typing
function extract_metalhead() {
    extract_metal_head();
}

function extract_workflow() {
    if (arguments.length < 2) {
        post("ERROR: extract_workflow requires trackID and deviceID arguments\n");
        post("Usage: extract_workflow(trackID, deviceID) - Extract device\n");
        post("Usage: extract_workflow(trackID, deviceID, chainID) - Extract specific chain\n");
        post("Example: extract_workflow(1, 0) - Extract Metal Head device\n");
        post("Example: extract_workflow(1, 0, 0) - Extract first chain in Metal Head\n");
        return;
    }

    var trackID = arguments[0];
    var deviceID = arguments[1];

    // Check if third argument provided (chainID)
    if (arguments.length >= 3) {
        var chainID = arguments[2];
        extract_chain(trackID, deviceID, chainID);
        return;
    }

    // Otherwise extract device
    extract_workflow_internal(trackID, deviceID);
}

// Test function
function test() {
    post("Rack Workflow Extractor loaded and ready!\n");
    post("Commands:\n");
    post("  extract_metal_head() - Extract Metal Head device overview\n");
    post("  extract_metal_head_chain() - Extract first chain in Metal Head\n");
    post("  extract_ezfreqsplit() - Extract EZFREQSPLIT device (better test)\n");
    post("  extract_ezfreqsplit_chain() - Extract first chain in EZFREQSPLIT\n");
    post("  extract_metalhead() - Same as extract_metal_head()\n");
    post("  extract(trackID, deviceID) - Extract any device workflow\n");
    post("  extract_workflow(trackID, deviceID) - Extract device\n");
    post("  extract_workflow(trackID, deviceID, chainID) - Extract specific chain\n");
    post("  extract_chain(trackID, deviceID, chainID) - Extract chain directly\n");
    post("  test() - Show this message\n");
    post("\n");
    post("Examples:\n");
    post("  extract_workflow(1, 0) - Extract Metal Head device\n");
    post("  extract_workflow(1, 1) - Extract EZFREQSPLIT device\n");
    post("  extract_workflow(1, 1, 0) - Extract LOWS-CHAIN from EZFREQSPLIT\n");
}

// Initialize on load
function loadbang() {
    post("Rack Workflow Extractor v1.0 loaded\n");
    test();
}
