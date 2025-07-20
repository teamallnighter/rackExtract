//
//  rackExtract.js
//  rackExtract
//
//  Created by BassDaddy on 07/20/2025
//
// Use this script to extract workflows from Abletin Live racks.


autowatch = 1;
inlets = 1;
outlets = 1;

// n8n Integration Configuration
var N8N_WEBHOOK_URL = "http://localhost:5678/webhook-test/rack-data";

// Modular Configuration - Controls server integration behavior
var ExtractorConfig = {
    auto_send_to_server: false,  // Don't automatically send to server
    server_enabled: true,        // Allow manual server operations
    offline_mode: false,         // Force offline-only operation
    debug_server: false          // Extra server debugging
};

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
// ENVIRONMENT VALIDATION FUNCTIONS

// Check if we're in a proper Max for Live environment
function validate_max_environment() {
    try {
        post("🔍 Validating Max for Live environment...\n");

        // Test basic LiveAPI functionality
        var testAPI = new LiveAPI();
        if (!testAPI) {
            post("❌ ERROR: LiveAPI not available - not in Max for Live?\n");
            return false;
        }

        // Test if we can access live_set
        try {
            testAPI.path = "live_set";
            var name = testAPI.get("name");
            post("✅ Live Set accessible: " + (name || "Untitled") + "\n");
        } catch (liveSetError) {
            post("❌ ERROR: Cannot access live_set: " + liveSetError + "\n");
            return false;
        }

        // Test track access
        try {
            testAPI.path = "live_set tracks 0";
            var trackName = testAPI.get("name");
            post("✅ Track 0 accessible: " + (trackName || "Unnamed") + "\n");
        } catch (trackError) {
            post("⚠️ WARNING: Track 0 not accessible: " + trackError + "\n");
            post("   Make sure you have at least one track in your Live set\n");
        }

        post("✅ Max for Live environment validated\n");
        return true;
    } catch (error) {
        post("❌ CRITICAL ERROR: Max environment validation failed: " + error + "\n");
        return false;
    }
}

// Validate that a specific track and device exist
function validate_track_device_path(trackID, deviceID) {
    try {
        post("🔍 Validating track " + trackID + ", device " + deviceID + "...\n");

        var trackPath = "live_set tracks " + trackID;
        var devicePath = trackPath + " devices " + deviceID;

        // Check track exists
        var trackAPI = new LiveAPI();
        trackAPI.path = trackPath;
        try {
            var trackName = trackAPI.get("name");
            post("✅ Track " + trackID + " found: " + (trackName || "Unnamed") + "\n");
        } catch (trackError) {
            post("❌ ERROR: Track " + trackID + " does not exist: " + trackError + "\n");
            return false;
        }

        // Check device exists
        var deviceAPI = new LiveAPI();
        deviceAPI.path = devicePath;
        try {
            var deviceName = deviceAPI.get("name");
            post("✅ Device " + deviceID + " found: " + (deviceName || "Unnamed") + "\n");
            return true;
        } catch (deviceError) {
            post("❌ ERROR: Device " + deviceID + " on track " + trackID + " does not exist: " + deviceError + "\n");
            return false;
        }

    } catch (error) {
        post("❌ ERROR in validate_track_device_path: " + error + "\n");
        return false;
    }
}

/////////////////////////////////////////
// MAIN WORKFLOW EXTRACTION FUNCTIONS

// Extract workflow from specific track and device
function extract_workflow_internal(trackID, deviceID) {
    post("=== RACK WORKFLOW EXTRACTOR ===\n");
    post("Extracting workflow from track " + trackID + ", device " + deviceID + "\n");

    try {
        // Step 1: Validate Max for Live environment
        if (!validate_max_environment()) {
            post("❌ ABORTING: Max for Live environment validation failed\n");
            return;
        }

        // Step 2: Validate track and device exist
        if (!validate_track_device_path(trackID, deviceID)) {
            post("❌ ABORTING: Track/device validation failed\n");
            return;
        }

        // Build path to target device
        var devicePath = Root + " tracks " + trackID + " devices " + deviceID;
        post("Target device path: " + devicePath + "\n");

        // Initialize workflow data structure
        WorkflowData = {
            metadata: {
                extracted_at: new Date().toISOString(),
                track_id: trackID,
                device_id: deviceID,
                extractor_version: "2.0"
            },
            workflow: {
                root_device: null,
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

        // Get root device info - unwrap arrays from LiveAPI
        var rootDeviceName = get_safe_name(deviceAPI);
        var deviceType = get_device_type(deviceAPI);
        var deviceClass = get_safe_property(deviceAPI, "class_name");
        var visibleMacros = get_safe_property(deviceAPI, "visible_macro_count");
        var variationCount = get_safe_property(deviceAPI, "variation_count");

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
            macros: extract_device_parameters(deviceAPI),  // Root device params are MACROS
            chains: []  // Initialize chains array for root device
        };

        // Remove any properties with 5e-324 values
        WorkflowData.workflow.root_device = filter_object_5e324(cleanedRootDevice);

        // Check if device has chains (is a rack)
        var children = deviceAPI.children;
        if (children && children.join(" ").match(/\s+?chains\s+/)) {
            post("Device has chains - extracting recursive workflow...\n");
            extract_recursive_chains(deviceAPI, devicePath, 0, WorkflowData.workflow.root_device);
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
function extract_recursive_chains(api, basePath, depth, parentContainer) {
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

            // Add chain to the parent container (root_device or nested device)
            parentContainer.chains.push(chainInfo);
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
                parameters: extract_device_parameters(api),
                chains: []  // Initialize chains array for potential nested chains
            };

            // Filter out any 5e-324 values from device info
            deviceInfo = filter_object_5e324(deviceInfo);

            // Add device to its parent chain
            chainInfo.devices.push(deviceInfo);

            // Check if this device also has chains (nested racks)
            var children = api.children;
            if (children && children.join(" ").match(/\s+?chains\s+/)) {
                post(spacing + "  Nested rack detected - going deeper...\n");
                extract_recursive_chains(api, devicePath, depth + 1, deviceInfo);
            } else {
                // If device has no chains, remove the empty chains array to keep JSON clean
                delete deviceInfo.chains;
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

                // Get parameter properties directly - unwrap arrays returned by LiveAPI
                var paramName = unwrap_array(paramAPI.get("name"));
                var paramValue = unwrap_array(paramAPI.get("value"));
                var paramDisplayValue = unwrap_array(paramAPI.get("display_value"));
                var paramDefaultValue = unwrap_array(paramAPI.get("default_value"));
                var paramMin = unwrap_array(paramAPI.get("min"));
                var paramMax = unwrap_array(paramAPI.get("max"));
                var paramQuantized = unwrap_array(paramAPI.get("is_quantized"));

                // Only skip parameters with corrupted ESSENTIAL properties (name or value)
                var isCorrupted = is_5e324_value(paramName) ||
                    is_5e324_value(paramValue) ||
                    paramName === null ||
                    paramName === undefined ||
                    paramName === "" ||
                    paramName === "unnamed";

                // Include parameters with valid name and value (other properties can be null/missing)
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

                    // Clean any remaining 5e-324 values from non-essential properties
                    paramInfo = clean_parameter_5e324(paramInfo);

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

// Unwrap single-element arrays returned by LiveAPI
function unwrap_array(value) {
    if (Array.isArray(value) && value.length === 1) {
        return value[0];
    }
    return value;
}

// Clean parameter object, allowing null values for non-essential properties
function clean_parameter_5e324(paramInfo) {
    var cleaned = {};

    for (var key in paramInfo) {
        if (paramInfo.hasOwnProperty(key)) {
            var value = paramInfo[key];

            // For essential properties (name, value), keep as is if not corrupted
            if (key === "name" || key === "value" || key === "parameter_id") {
                cleaned[key] = value;
            }
            // For optional properties, set to null if corrupted, otherwise keep
            else if (is_5e324_value(value)) {
                cleaned[key] = null;
            }
            else {
                cleaned[key] = value;
            }
        }
    }

    return cleaned;
}

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

// Safe property getter that handles LiveAPI errors gracefully
function get_safe_property(api, propertyName) {
    try {
        var value = api.get(propertyName);
        return unwrap_array(value);
    } catch (error) {
        post("WARNING: Could not get property '" + propertyName + "': " + error + "\n");
        return null;
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

/////////////////////////////////////////
// MODULAR SERVER INTEGRATION (separated from core extraction)

// Check if server is available before attempting connection
function check_server_health() {
    if (ExtractorConfig.offline_mode) {
        post("ℹ️ Offline mode enabled - server operations disabled\n");
        return false;
    }

    if (!ExtractorConfig.server_enabled) {
        post("ℹ️ Server integration disabled in configuration\n");
        return false;
    }

    post("🔍 Checking server health at " + N8N_WEBHOOK_URL + "...\n");
    return true;  // TODO: Add actual health check ping
}

// Send current WorkflowData to AI server (modular function)
function send_to_ai_server() {
    if (!WorkflowData) {
        post("❌ No workflow data to send - extract a rack first\n");
        return;
    }

    if (!check_server_health()) {
        post("⚠️ Server not available - extraction data preserved locally\n");
        return;
    }

    post("🚀 SENDING TO AI ANALYSIS SERVER...\n");
    send_to_n8n_server(WorkflowData);
}

// Send last extracted data to server (for retry scenarios)
function retry_ai_analysis() {
    if (!WorkflowData) {
        post("❌ No previous extraction data found\n");
        post("💡 Extract a rack first, then use retry_ai_analysis()\n");
        return;
    }

    post("🔄 Retrying AI analysis with last extracted data...\n");
    send_to_ai_server();
}

// Simple HTTP function for Max for Live
function send_to_n8n_server(workflowData) {
    try {
        post("=== SENDING TO N8N SERVER ===\n");
        post("URL: " + N8N_WEBHOOK_URL + "\n");

        var jsonString = JSON.stringify(workflowData, null, 2);
        post("Payload size: " + jsonString.length + " characters\n");

        var httpMethod = new XMLHttpRequest();
        post("Using XMLHttpRequest method\n");

        httpMethod.onreadystatechange = function () {
            if (httpMethod.readyState === 4) {
                var status = httpMethod.status || 0;
                var responseText = httpMethod.responseText || "";

                post("🔄 HTTP Response received - Status: " + status + "\n");

                if (status === 200) {
                    post("✅ SUCCESS: Data sent to n8n server\n");
                    post("Raw response: " + responseText + "\n");

                    try {
                        var response = JSON.parse(responseText);

                        if (response.status === "success") {
                            post("🎉 === AI ANALYSIS COMPLETE ===\n");
                            post("🎵 Rack Name: " + (response.rack_name || "Unknown") + "\n");
                            post("🔧 Device Count: " + (response.device_count || "Unknown") + "\n");
                            post("⚡ Complexity: " + (response.complexity_score || "Unknown") + "/100\n");
                            post("🎯 Use Case: " + (response.primary_use_case || "Unknown") + "\n");

                            if (response.tags && response.tags.length > 0) {
                                post("🏷️ Tags: " + response.tags.join(", ") + "\n");
                            }

                            post("✨ Processing completed at: " + (response.processed_at || "Unknown") + "\n");
                        } else {
                            post("⚠️ Workflow triggered but not completed\n");
                            post("💡 Check n8n executions tab for results\n");
                        }
                    } catch (parseError) {
                        post("⚠️ Response received but couldn't parse JSON: " + parseError + "\n");
                    }
                } else {
                    post("❌ ERROR: HTTP " + status + "\n");
                    post("Response: " + responseText + "\n");
                    post("💡 Tip: Use retry_ai_analysis() to try again later\n");
                }
            }
        };

        httpMethod.open("POST", N8N_WEBHOOK_URL, true);
        httpMethod.setRequestHeader("Content-Type", "application/json");
        httpMethod.send(jsonString);

    } catch (error) {
        post("ERROR in send_to_n8n_server: " + error + "\n");
        post("💡 Extraction data preserved - use retry_ai_analysis() when server is back\n");
    }
}

/////////////////////////////////////////
// CONFIGURATION FUNCTIONS

// Set configuration options
function set_config(key, value) {
    if (ExtractorConfig.hasOwnProperty(key)) {
        var oldValue = ExtractorConfig[key];
        ExtractorConfig[key] = value;
        post("⚙️ Configuration updated: " + key + " = " + value + " (was: " + oldValue + ")\n");
    } else {
        post("❌ Unknown configuration key: " + key + "\n");
        show_config();
    }
}

// Show current configuration
function show_config() {
    post("⚙️ === EXTRACTOR CONFIGURATION ===\n");
    for (var key in ExtractorConfig) {
        if (ExtractorConfig.hasOwnProperty(key)) {
            post("  " + key + ": " + ExtractorConfig[key] + "\n");
        }
    }
    post("💡 Use set_config(key, value) to change settings\n");
}

// Enable offline mode (disables all server operations)
function enable_offline_mode() {
    set_config('offline_mode', true);
    post("🔌 Offline mode enabled - extraction will work without server\n");
}

// Enable auto-send to server after extraction
function enable_auto_analysis() {
    set_config('auto_send_to_server', true);
    post("🤖 Auto AI analysis enabled - extractions will automatically send to server\n");
}

// Export workflow data as JSON (PURE EXTRACTION - no server dependencies)
function export_workflow_json() {
    try {
        post("=== WORKFLOW EXTRACTION COMPLETE ===\n");

        var rootName = "unknown";
        var totalDeviceCount = 0;
        var totalChainCount = 0;

        if (WorkflowData.workflow.root_device) {
            rootName = WorkflowData.workflow.root_device.name;
            post("Root device: " + rootName + "\n");

            // Count devices and chains recursively
            var counts = count_devices_and_chains_recursive(WorkflowData.workflow.root_device);
            totalDeviceCount = counts.devices;
            totalChainCount = counts.chains;
        }

        post("Total devices found: " + totalDeviceCount + "\n");
        post("Total chains found: " + totalChainCount + "\n");

        var jsonString = JSON.stringify(WorkflowData, null, 2);
        outlet(0, "workflow_json", jsonString);

        post("JSON Export (first 500 chars):\n");
        post(jsonString.substring(0, 500) + "...\n");

        post("✅ Extraction completed successfully!\n");

        // MODULAR: Optional server integration based on configuration
        if (ExtractorConfig.auto_send_to_server && !ExtractorConfig.offline_mode) {
            post("� Auto-sending to AI server (configured behavior)...\n");
            send_to_ai_server();
        } else {
            post("💡 To analyze with AI: send_to_ai_server()\n");
            post("💡 To configure auto-send: set_config('auto_send_to_server', true)\n");
        }

    } catch (error) {
        post("ERROR in export_workflow_json: " + error + "\n");
    }
}

// Helper function to recursively count devices and chains
function count_devices_and_chains_recursive(container) {
    var deviceCount = 0;
    var chainCount = 0;

    if (container.chains && container.chains.length > 0) {
        chainCount += container.chains.length;

        for (var i = 0; i < container.chains.length; i++) {
            var chain = container.chains[i];

            if (chain.devices && chain.devices.length > 0) {
                deviceCount += chain.devices.length;

                // Recursively count nested devices and chains
                for (var j = 0; j < chain.devices.length; j++) {
                    var device = chain.devices[j];
                    if (device.chains && device.chains.length > 0) {
                        var nestedCounts = count_devices_and_chains_recursive(device);
                        deviceCount += nestedCounts.devices;
                        chainCount += nestedCounts.chains;
                    }
                }
            }
        }
    }

    return {
        devices: deviceCount,
        chains: chainCount
    };
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
    try {
        var api = new LiveAPI();

        if (!api) {
            post("ERROR: Failed to create LiveAPI object\n");
            return null;
        }

        // Test if LiveAPI is actually functional
        try {
            var testId = api.id;  // This will fail if LiveAPI isn't working
        } catch (testError) {
            post("ERROR: LiveAPI object not functional: " + testError + "\n");
            return null;
        }

        var id = /^id (\d+)$/.exec(path);
        if (id) {
            api.id = parseInt(id[1]);
        } else {
            api.path = path;

            // Validate that the path is accessible
            try {
                var testName = api.get("name");
                if (testName === undefined) {
                    post("WARNING: Path may not exist: " + path + "\n");
                }
            } catch (pathError) {
                post("ERROR: Cannot access path " + path + ": " + pathError + "\n");
                return null;
            }
        }
        api.wtype = type;
        return api;
    } catch (error) {
        post("ERROR in WorkflowAPIMenu: " + error + "\n");
        return null;
    }
}

/////////////////////////////////////////
// FILTER FUNCTIONS (simplified from chooser)

function extract_device_workflow(api) {
    return true;
}

function extract_chain_workflow(api) {
    return true;
}

/////////////////////////////////////////
// USER INTERFACE

// Main function - extract workflow from Metal Head device
function extract_metal_head() {
    extract_workflow_internal(1, 0);
}

// Main function - extract EZFREQSPLIT device (simpler test case)
function extract_ezfreqsplit() {
    extract_workflow_internal(1, 1);
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

function extract_workflow() {
    if (arguments.length < 2) {
        post("ERROR: extract_workflow requires trackID and deviceID arguments\n");
        post("Usage: extract_workflow(trackID, deviceID) - Extract device\n");
        post("Example: extract_workflow(1, 0) - Extract device\n");
        return;
    }

    var trackID = arguments[0];
    var deviceID = arguments[1];
    extract_workflow_internal(trackID, deviceID);
}

// Test function
function test() {
    post("🎵 Rack Workflow Extractor with AI Integration loaded!\n");
    post("Server: " + N8N_WEBHOOK_URL + "\n");
    post("Commands:\n");
    post("  test() - Show this message\n");
    post("  validate_environment() - Check Max for Live setup\n");
    post("  extract_metal_head() - Extract Metal Head device\n");
    post("  extract_ezfreqsplit() - Extract EZFREQSPLIT device\n");
    post("  extract_workflow(trackID, deviceID) - Extract any device\n");
    post("  diagnose_tracks() - Show available tracks and devices\n");
    post("\nServer Commands:\n");
    post("  send_to_ai_server() - Send last extraction to AI\n");
    post("  retry_ai_analysis() - Retry failed AI analysis\n");
    post("  test_n8n_connection() - Test server connectivity\n");
    post("\nConfiguration:\n");
    post("  show_config() - Show current settings\n");
    post("  enable_offline_mode() - Disable server operations\n");
    post("  enable_auto_analysis() - Auto-send to AI after extraction\n");
    post("\nExamples:\n");
    post("  extract_workflow(1, 0) - Extract device on track 1, slot 0\n");
    post("  send_to_ai_server() - Analyze with AI (after extraction)\n");
    post("\n🔧 Modular design: Extraction works offline, AI analysis optional!\n");
}

// Diagnostic function to check environment
function validate_environment() {
    post("🔧 === ENVIRONMENT DIAGNOSTIC ===\n");
    return validate_max_environment();
}

// Diagnostic function to show available tracks and devices
function diagnose_tracks() {
    post("🔍 === TRACK AND DEVICE DIAGNOSTIC ===\n");

    try {
        var liveSetAPI = new LiveAPI();
        liveSetAPI.path = "live_set";

        var trackCount = liveSetAPI.getcount("tracks");
        post("Found " + trackCount + " tracks:\n");

        for (var i = 0; i < Math.min(trackCount, 10); i++) {  // Limit to first 10 tracks
            try {
                var trackAPI = new LiveAPI();
                trackAPI.path = "live_set tracks " + i;
                var trackName = trackAPI.get("name") || "Unnamed";
                var deviceCount = trackAPI.getcount("devices");

                post("  Track " + i + ": '" + trackName + "' (" + deviceCount + " devices)\n");

                // Show first few devices on each track
                for (var j = 0; j < Math.min(deviceCount, 5); j++) {
                    try {
                        var deviceAPI = new LiveAPI();
                        deviceAPI.path = "live_set tracks " + i + " devices " + j;
                        var deviceName = deviceAPI.get("name") || "Unnamed";
                        post("    Device " + j + ": '" + deviceName + "'\n");
                    } catch (deviceError) {
                        post("    Device " + j + ": ERROR - " + deviceError + "\n");
                    }
                }

                if (deviceCount > 5) {
                    post("    ... and " + (deviceCount - 5) + " more devices\n");
                }

            } catch (trackError) {
                post("  Track " + i + ": ERROR - " + trackError + "\n");
            }
        }

        if (trackCount > 10) {
            post("... and " + (trackCount - 10) + " more tracks\n");
        }

        post("💡 Use extract_workflow(trackID, deviceID) to extract a specific device\n");

    } catch (error) {
        post("❌ ERROR in diagnose_tracks: " + error + "\n");
    }
}

// Test n8n connection
function test_n8n_connection() {
    post("🧪 Testing n8n connection...\n");

    var testData = {
        metadata: {
            extracted_at: new Date().toISOString(),
            track_id: 999,
            device_id: 999,
            extractor_version: "1.0"
        },
        workflow: {
            root_device: {
                name: "Test Rack",
                type: "test"
            },
            devices: [],
            chains: []
        }
    };

    send_to_n8n_server(testData);
}

// Initialize on load
function loadbang() {
    post("🎵 Rack Workflow Extractor v2.0 with AI Integration loaded\n");
    test();
}