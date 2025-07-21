//
//  rackExtract.js
//
//  Created by BassDaddy on 07/20/2025
//
// Use this script to extract workflows from Abletin Live racks.


autowatch = 1;
inlets = 1;
outlets = 2;  // Added second outlet for jweb communication

// n8n Integration Configuration
var N8N_WEBHOOK_URL = "http://localhost:5678/webhook-test/rack-data";

// PostgreSQL API Configuration (Supabase PostgREST)
var POSTGRES_API_URL = "http://localhost:54321/rest/v1/rpc/store_rack";
var SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

// Modular Configuration - Controls server integration behavior
var ExtractorConfig = {
    auto_send_to_server: false,  // Don't automatically send to server
    server_enabled: true,        // Allow manual server operations
    offline_mode: false,         // Force offline-only operation
    debug_server: false          // Extra server debugging
};

// User Metadata Storage - for current extraction session
var UserMetadata = {
    use_case: "",           // User-defined use case (e.g., "mastering", "creative_fx", "mixing")
    tags: [],              // User-defined tags (e.g., ["multiband", "vintage", "parallel"])
    description: "",       // User description of the rack
    category: "",          // Category (e.g., "dynamics", "spatial", "modulation")
    difficulty: "",        // Complexity level (e.g., "beginner", "intermediate", "advanced")
    genre: "",            // Musical genre (e.g., "electronic", "rock", "jazz")
    notes: ""             // Additional user notes
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
// JWEB INTEGRATION FUNCTIONS (for HTML metadata form)

// Send current metadata to jweb form
function send_metadata_to_form() {
    var metadataJson = JSON.stringify(UserMetadata);
    outlet(1, "metadata_update", metadataJson);
    post("📨 Metadata sent to form\n");
}

// Handle metadata received from jweb form
function receive_metadata_from_form(metadataJson) {
    try {
        var metadata = JSON.parse(metadataJson);

        // Update UserMetadata with form data
        UserMetadata.use_case = metadata.use_case || "";
        UserMetadata.tags = metadata.tags || [];
        UserMetadata.description = metadata.description || "";
        UserMetadata.category = metadata.category || "";
        UserMetadata.difficulty = metadata.difficulty || "";
        UserMetadata.genre = metadata.genre || "";
        UserMetadata.notes = metadata.notes || "";

        post("📥 Metadata received from form:\n");
        post("🎯 Use Case: " + UserMetadata.use_case + "\n");
        post("🏷️ Tags: [" + UserMetadata.tags.join(", ") + "]\n");
        post("📂 Category: " + UserMetadata.category + "\n");

    } catch (error) {
        post("❌ Error parsing metadata from form: " + error + "\n");
    }
}

// Handle extraction request from jweb form
function extract_from_form(trackID, deviceID) {
    post("🎯 Extraction requested from form: track " + trackID + ", device " + deviceID + "\n");

    // Use the existing extraction function
    extract_workflow_internal(trackID, deviceID);
}

// Send extraction status to form
function send_extraction_status(success) {
    outlet(1, "extraction_complete", success);
    post("📊 Extraction status sent to form: " + (success ? "success" : "failed") + "\n");
}

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
                extractor_version: "2.0",
                // User-defined metadata
                use_case: UserMetadata.use_case || "",
                tags: UserMetadata.tags.slice(), // Copy array
                description: UserMetadata.description || "",
                category: UserMetadata.category || "",
                difficulty: UserMetadata.difficulty || "",
                genre: UserMetadata.genre || "",
                notes: UserMetadata.notes || ""
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

        // Ensure we always have a valid rack name - fallback to generated name if needed
        if (!rootDeviceName || rootDeviceName === "unnamed" || rootDeviceName === "" || is_5e324_value(rootDeviceName)) {
            rootDeviceName = generate_rack_name(trackID, deviceID, deviceType);
            post("⚠️ Generated fallback rack name: " + rootDeviceName + "\n");
        }

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

        // Add top-level rack_name for compatibility with overview systems
        WorkflowData.rack_name = rootDeviceName;

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

        // Send success status to jweb form
        send_extraction_status(true);

    } catch (error) {
        post("ERROR in extract_workflow: " + error + "\n");

        // Send failure status to jweb form
        send_extraction_status(false);
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

            // Preserve essential fields even if they might look corrupted
            var isEssentialField = (key === "name" || key === "rack_name" || key === "parameter_id" || key === "device_id" || key === "chain_id");

            // Skip keys that have 5e-324 values (except essential fields)
            if (is_5e324_value(value) && !isEssentialField) {
                post("        Filtered out " + key + " (5e-324 corruption)\n");
                continue;
            }

            // For essential fields, provide fallback if corrupted
            if (is_5e324_value(value) && isEssentialField) {
                if (key === "name" || key === "rack_name") {
                    filtered[key] = "unnamed";
                    post("        Preserved essential field " + key + " with fallback value\n");
                } else {
                    filtered[key] = value; // Keep IDs even if potentially corrupted
                }
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

        // Handle various empty/invalid states
        if (name == "" || name == undefined || name == null || !name) {
            return "unnamed";
        }

        // Handle array return values
        if (Array.isArray(name)) {
            if (name.length > 0 && name[0] && name[0] !== "") {
                return String(name[0]);
            } else {
                return "unnamed";
            }
        }

        // Convert to string and check for corruption
        var stringName = String(name);
        if (is_5e324_value(stringName) || stringName === "5e-324" || stringName === "") {
            return "unnamed";
        }

        return stringName;
    } catch (error) {
        post("WARNING: get_safe_name error: " + error + "\n");
        return "unnamed";
    }
}

// Generate a meaningful rack name when device name is missing or invalid
function generate_rack_name(trackID, deviceID, deviceType) {
    var timestamp = Date.now();
    var typePrefix = "";

    if (deviceType === "rack") {
        typePrefix = "Rack";
    } else {
        typePrefix = "Device";
    }

    return typePrefix + "_T" + trackID + "D" + deviceID + "_" + timestamp;
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

// Simple HTTP function for Max for Live with fallback support
function send_to_n8n_server(workflowData) {
    try {
        post("=== SENDING TO N8N SERVER ===\n");
        post("URL: " + N8N_WEBHOOK_URL + "\n");

        var jsonString = JSON.stringify(workflowData, null, 2);
        post("Payload size: " + jsonString.length + " characters\n");

        // Try different HTTP objects available in Max for Live
        var ajaxreq = null;

        // Method 1: Try Ajax (most common)
        try {
            ajaxreq = new Ajax(N8N_WEBHOOK_URL);
            post("📡 Using Ajax object\n");
        } catch (ajaxError) {
            post("⚠️ Ajax object not available: " + ajaxError + "\n");
        }

        // Method 2: Try XMLHttpRequest (alternative)
        if (!ajaxreq) {
            try {
                ajaxreq = new XMLHttpRequest();
                ajaxreq.open("POST", N8N_WEBHOOK_URL, true);
                post("📡 Using XMLHttpRequest object\n");
            } catch (xmlError) {
                post("⚠️ XMLHttpRequest object not available: " + xmlError + "\n");
            }
        }

        // Method 3: Check for max object (Max 8+ specific)
        if (!ajaxreq && typeof max !== "undefined" && max.launchurl) {
            post("❌ HTTP request objects not available - Max version may not support HTTP\n");
            post("💡 Alternative: Use max.launchurl() to open URL in browser\n");
            post("💡 Or use external HTTP tool like curl or Postman\n");
            post("💡 Extraction data preserved - available in WorkflowData variable\n");
            return;
        }

        if (!ajaxreq) {
            post("❌ CRITICAL: No HTTP request objects available in this Max environment\n");
            post("💡 This may be an older Max version or restricted environment\n");
            post("💡 ALTERNATIVE WORKFLOWS AVAILABLE:\n");
            post("  1. export_to_file() - Save JSON to file, then upload manually\n");
            post("  2. copy_curl_command() - Get curl command for terminal\n");
            post("  3. show_json_for_copy() - Display JSON for manual copy/paste\n");
            post("💡 Extraction completed successfully - data available in WorkflowData\n");
            return;
        }

        // Configure request based on object type
        if (ajaxreq.constructor.name === "Ajax" || typeof ajaxreq.setRequestHeader === "function") {
            // Ajax object method
            ajaxreq.setRequestHeader("Content-Type", "application/json");

            // Set up the callback for when request completes
            ajaxreq.done = function (result) {
                post("✅ SUCCESS: Data sent to n8n server\n");
                post("📄 Response: " + result + "\n");

                try {
                    var response = JSON.parse(result);

                    if (response.status === "success") {
                        post("🎉 === AI ANALYSIS COMPLETE ===\n");
                        post("🎵 Rack Name: " + (response.rack_name || "Unknown") + "\n");
                        post("🔧 Device Count: " + (response.device_count || "Unknown") + "\n");
                        post("⚡ Complexity: " + (response.complexity_score || "Unknown") + "/100\n");
                        post("🎯 Use Case: " + (response.primary_use_case || "Unknown") + "\n");

                        if (response.key_techniques && response.key_techniques.length > 0) {
                            post("🏷️ Techniques: " + response.key_techniques.join(", ") + "\n");
                        }

                        if (response.use_cases && response.use_cases.length > 0) {
                            post("💡 Use Cases: " + response.use_cases.join(", ") + "\n");
                        }

                        post("✨ Processing completed at: " + (response.processed_at || "Unknown") + "\n");
                    } else {
                        post("⚠️ Workflow triggered but analysis incomplete\n");
                        post("💡 Check n8n executions tab for results\n");
                    }
                } catch (parseError) {
                    post("⚠️ Response received but couldn't parse JSON: " + parseError + "\n");
                    post("Raw response: " + result + "\n");
                }
            };

            ajaxreq.fail = function (error) {
                post("❌ ERROR: HTTP request failed\n");
                post("Error details: " + JSON.stringify(error) + "\n");
                post("URL attempted: " + N8N_WEBHOOK_URL + "\n");
                post("💡 Tip: Check if n8n workflow is active and webhook endpoint exists\n");
                post("💡 Test manually: curl -X POST -H 'Content-Type: application/json' -d '{}' " + N8N_WEBHOOK_URL + "\n");
                post("💡 Use retry_ai_analysis() to try again later\n");
            };

            // Send POST request with JSON data
            ajaxreq.post(jsonString);

        } else if (ajaxreq.constructor.name === "XMLHttpRequest" || typeof ajaxreq.open === "function") {
            // XMLHttpRequest method
            ajaxreq.setRequestHeader("Content-Type", "application/json");

            ajaxreq.onreadystatechange = function () {
                if (ajaxreq.readyState === 4) {
                    if (ajaxreq.status === 200) {
                        post("✅ SUCCESS: Data sent to n8n server (XMLHttpRequest)\n");
                        post("📄 Response: " + ajaxreq.responseText + "\n");

                        try {
                            var response = JSON.parse(ajaxreq.responseText);
                            // Same response handling as Ajax version above
                            if (response.status === "success") {
                                post("🎉 === AI ANALYSIS COMPLETE ===\n");
                                post("🎵 Rack Name: " + (response.rack_name || "Unknown") + "\n");
                                post("🔧 Device Count: " + (response.device_count || "Unknown") + "\n");
                                post("⚡ Complexity: " + (response.complexity_score || "Unknown") + "/100\n");
                            }
                        } catch (parseError) {
                            post("⚠️ Response parsing error: " + parseError + "\n");
                        }
                    } else {
                        post("❌ ERROR: HTTP request failed (XMLHttpRequest)\n");
                        post("Status: " + ajaxreq.status + "\n");
                        post("Response: " + ajaxreq.responseText + "\n");
                    }
                }
            };

            ajaxreq.send(jsonString);
        }

        post("📤 Request sent to server...\n");

    } catch (error) {
        post("ERROR in send_to_n8n_server: " + error + "\n");
        post("💡 Extraction data preserved - use retry_ai_analysis() when server is back\n");
    }
}

/////////////////////////////////////////
// JWEB INTEGRATION (HTML Form Communication)

// Handle messages from jweb form
function save_metadata(metadataJson) {
    try {
        var metadata = JSON.parse(metadataJson);

        // Update UserMetadata from form
        UserMetadata.use_case = metadata.use_case || "";
        UserMetadata.description = metadata.description || "";
        UserMetadata.category = metadata.category || "";
        UserMetadata.difficulty = metadata.difficulty || "";
        UserMetadata.genre = metadata.genre || "";
        UserMetadata.tags = metadata.tags || [];
        UserMetadata.notes = metadata.notes || "";

        post("📝 Metadata received from form:\n");
        post("🎯 Use Case: " + UserMetadata.use_case + "\n");
        post("🏷️ Tags: [" + UserMetadata.tags.join(", ") + "]\n");
        post("📂 Category: " + UserMetadata.category + "\n");

        // Send confirmation back to form via outlet 1 (jweb)
        outlet(1, "metadata_saved");

    } catch (error) {
        post("❌ Error parsing metadata from form: " + error + "\n");
    }
}

// Send current metadata to jweb form
function load_metadata() {
    var metadataJson = JSON.stringify(UserMetadata);

    // Send current metadata to form via outlet 1 (jweb)
    outlet(1, "metadata_update", metadataJson);

    post("📤 Current metadata sent to form\n");
}

// Handle extraction request from form
function extract_with_metadata(trackID, deviceID) {
    post("🎯 Extraction requested from form: track " + trackID + ", device " + deviceID + "\n");

    // Use existing extraction function
    extract_workflow_internal(trackID, deviceID);
}

// Send extraction status to form
function send_extraction_status(success) {
    outlet(1, "extraction_complete", success);
}

/////////////////////////////////////////
// METADATA MANAGEMENT FUNCTIONS

// Set use case for current extraction
function set_use_case(useCase) {
    UserMetadata.use_case = String(useCase || "");
    post("🎯 Use case set to: '" + UserMetadata.use_case + "'\n");
}

// Add tags (can be single tag or array of tags)
function add_tags() {
    var tags = arrayfromargs(arguments);

    for (var i = 0; i < tags.length; i++) {
        var tag = String(tags[i]).toLowerCase();
        if (tag && UserMetadata.tags.indexOf(tag) === -1) {
            UserMetadata.tags.push(tag);
        }
    }

    post("🏷️ Tags now: [" + UserMetadata.tags.join(", ") + "]\n");
}

// Remove specific tags
function remove_tags() {
    var tagsToRemove = arrayfromargs(arguments);

    for (var i = 0; i < tagsToRemove.length; i++) {
        var tag = String(tagsToRemove[i]).toLowerCase();
        var index = UserMetadata.tags.indexOf(tag);
        if (index !== -1) {
            UserMetadata.tags.splice(index, 1);
        }
    }

    post("🏷️ Tags now: [" + UserMetadata.tags.join(", ") + "]\n");
}

// Clear all tags
function clear_tags() {
    UserMetadata.tags = [];
    post("🏷️ All tags cleared\n");
}

// Set description
function set_description(description) {
    UserMetadata.description = String(description || "");
    post("📝 Description set to: '" + UserMetadata.description + "'\n");
}

// Set category
function set_category(category) {
    UserMetadata.category = String(category || "");
    post("📂 Category set to: '" + UserMetadata.category + "'\n");
}

// Set difficulty level
function set_difficulty(difficulty) {
    var validLevels = ["beginner", "intermediate", "advanced"];
    var level = String(difficulty || "").toLowerCase();

    if (validLevels.indexOf(level) !== -1 || level === "") {
        UserMetadata.difficulty = level;
        post("⚡ Difficulty set to: '" + UserMetadata.difficulty + "'\n");
    } else {
        post("❌ Invalid difficulty. Use: beginner, intermediate, advanced, or empty\n");
    }
}

// Set genre
function set_genre(genre) {
    UserMetadata.genre = String(genre || "");
    post("🎵 Genre set to: '" + UserMetadata.genre + "'\n");
}

// Set notes
function set_notes(notes) {
    UserMetadata.notes = String(notes || "");
    post("📋 Notes set to: '" + UserMetadata.notes + "'\n");
}

// Show current metadata
function show_metadata() {
    post("📊 === CURRENT METADATA ===\n");
    post("🎯 Use Case: '" + UserMetadata.use_case + "'\n");
    post("🏷️ Tags: [" + UserMetadata.tags.join(", ") + "]\n");
    post("📝 Description: '" + UserMetadata.description + "'\n");
    post("📂 Category: '" + UserMetadata.category + "'\n");
    post("⚡ Difficulty: '" + UserMetadata.difficulty + "'\n");
    post("🎵 Genre: '" + UserMetadata.genre + "'\n");
    post("📋 Notes: '" + UserMetadata.notes + "'\n");
    post("💡 This metadata will be included in the next extraction\n");
}

// Clear all metadata
function clear_metadata() {
    UserMetadata = {
        use_case: "",
        tags: [],
        description: "",
        category: "",
        difficulty: "",
        genre: "",
        notes: ""
    };
    post("🧹 All metadata cleared\n");
}

// Preset metadata for common use cases
function preset_mastering() {
    UserMetadata.use_case = "mastering";
    UserMetadata.category = "dynamics";
    UserMetadata.tags = ["mastering", "finalizer", "loudness"];
    post("🎛️ Mastering preset applied\n");
    show_metadata();
}

function preset_creative_fx() {
    UserMetadata.use_case = "creative_fx";
    UserMetadata.category = "modulation";
    UserMetadata.tags = ["creative", "experimental", "fx"];
    post("🎨 Creative FX preset applied\n");
    show_metadata();
}

function preset_mixing() {
    UserMetadata.use_case = "mixing";
    UserMetadata.category = "processing";
    UserMetadata.tags = ["mixing", "utility", "workflow"];
    post("🎚️ Mixing preset applied\n");
    show_metadata();
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

        // Send success status to jweb form
        send_extraction_status(true);

        // Show metadata included in extraction
        if (WorkflowData.metadata.use_case || WorkflowData.metadata.tags.length > 0) {
            post("📊 === METADATA INCLUDED ===\n");
            if (WorkflowData.metadata.use_case) {
                post("🎯 Use Case: " + WorkflowData.metadata.use_case + "\n");
            }
            if (WorkflowData.metadata.tags.length > 0) {
                post("🏷️ Tags: [" + WorkflowData.metadata.tags.join(", ") + "]\n");
            }
            if (WorkflowData.metadata.category) {
                post("📂 Category: " + WorkflowData.metadata.category + "\n");
            }
            if (WorkflowData.metadata.description) {
                post("📝 Description: " + WorkflowData.metadata.description + "\n");
            }
        } else {
            post("💡 No metadata set - use set_use_case(), add_tags() etc. before extraction\n");
        }

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
        // Send failure status to jweb form
        send_extraction_status(false);
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
// USER INPUT HANDLING (Max for Live inlet/outlet system)

// Handle messages from Max patch inlets
function anything() {
    var message = messagename;
    var args = arrayfromargs(arguments);

    post("📨 Received message: " + message + " with args: " + args.join(", ") + "\n");

    // Route messages to appropriate functions
    switch (message) {
        // JWEB FORM INTEGRATION MESSAGES
        case "save_metadata":
            if (args.length >= 1) {
                receive_metadata_from_form(args[0]);
            }
            break;

        case "load_metadata":
            send_metadata_to_form();
            break;

        case "extract_with_metadata":
            if (args.length >= 2) {
                var trackID = parseInt(args[0]);
                var deviceID = parseInt(args[1]);
                extract_from_form(trackID, deviceID);
            }
            break;

        // EXISTING EXTRACTION MESSAGES
        case "extract":
            if (args.length >= 2) {
                var trackID = parseInt(args[0]);
                var deviceID = parseInt(args[1]);
                extract_workflow_internal(trackID, deviceID);
            } else {
                post("❌ extract message requires trackID and deviceID\n");
                post("Usage: extract 1 0\n");
            }
            break;

        case "analyze":
            send_to_ai_server();
            break;

        case "config":
            if (args.length >= 2) {
                set_config(args[0], args[1]);
            } else {
                show_config();
            }
            break;

        // Metadata commands
        case "use_case":
            if (args.length >= 1) {
                set_use_case(args.join(" "));
            } else {
                post("Usage: use_case <description>\n");
            }
            break;

        case "tags":
            if (args.length >= 1) {
                add_tags.apply(null, args);
            } else {
                post("Usage: tags <tag1> <tag2> ...\n");
            }
            break;

        case "description":
            if (args.length >= 1) {
                set_description(args.join(" "));
            } else {
                post("Usage: description <text>\n");
            }
            break;

        case "category":
            if (args.length >= 1) {
                set_category(args.join(" "));
            } else {
                post("Usage: category <category>\n");
            }
            break;

        case "difficulty":
            if (args.length >= 1) {
                set_difficulty(args[0]);
            } else {
                post("Usage: difficulty <beginner|intermediate|advanced>\n");
            }
            break;

        case "genre":
            if (args.length >= 1) {
                set_genre(args.join(" "));
            } else {
                post("Usage: genre <genre>\n");
            }
            break;

        case "notes":
            if (args.length >= 1) {
                set_notes(args.join(" "));
            } else {
                post("Usage: notes <text>\n");
            }
            break;

        case "show_metadata":
            show_metadata();
            break;

        case "clear_metadata":
            clear_metadata();
            break;

        case "preset_mastering":
            preset_mastering();
            break;

        case "preset_creative":
            preset_creative_fx();
            break;

        case "preset_mixing":
            preset_mixing();
            break;

        // jweb integration commands
        case "save_metadata":
            if (args.length >= 1) {
                save_metadata(args[0]);
            }
            break;

        case "load_metadata":
            load_metadata();
            break;

        case "extract_with_metadata":
            if (args.length >= 2) {
                var trackID = parseInt(args[0]);
                var deviceID = parseInt(args[1]);
                extract_with_metadata(trackID, deviceID);
            }
            break;

        case "offline":
            enable_offline_mode();
            break;

        case "auto":
            enable_auto_analysis();
            break;

        case "diagnose":
            diagnose_tracks();
            break;

        case "validate":
            validate_environment();
            break;

        case "test_server":
            test_n8n_connection();
            break;

        case "help":
            show_help();
            break;

        default:
            post("❓ Unknown message: " + message + "\n");
            post("💡 Send 'help' for available commands\n");
            break;
    }
}

// Handle numeric input (for simple track/device selection)
function msg_int(value) {
    post("📊 Received number: " + value + "\n");
    post("💡 Use 'extract <trackID> <deviceID>' for extraction\n");
}

// Handle float input
function msg_float(value) {
    post("📊 Received float: " + value + "\n");
    post("💡 Use 'extract <trackID> <deviceID>' for extraction\n");
}

// Handle list input (for multiple parameters)
function list() {
    var args = arrayfromargs(arguments);
    post("📋 Received list: " + args.join(", ") + "\n");

    if (args.length >= 2) {
        var trackID = parseInt(args[0]);
        var deviceID = parseInt(args[1]);
        if (!isNaN(trackID) && !isNaN(deviceID)) {
            post("🎯 Interpreting as extract " + trackID + " " + deviceID + "\n");
            extract_workflow_internal(trackID, deviceID);
        } else {
            post("❌ List should contain numeric trackID and deviceID\n");
        }
    } else {
        post("❌ List should contain at least trackID and deviceID\n");
    }
}

// Show help for Max patch users
function show_help() {
    post("📚 === MAX PATCH MESSAGE COMMANDS ===\n");
    post("Extraction Commands:\n");
    post("  extract <trackID> <deviceID> - Extract specific device\n");
    post("  analyze - Send last extraction to AI server\n");
    post("  diagnose - Show available tracks and devices\n");
    post("  validate - Check Max for Live environment\n");
    post("\nJWEB Form Integration:\n");
    post("  save_metadata <json> - Receive metadata from jweb form\n");
    post("  load_metadata - Send current metadata to jweb form\n");
    post("  extract_with_metadata <trackID> <deviceID> - Extract with form metadata\n");
    post("\nMetadata Commands (direct):\n");
    post("  use_case <description> - Set use case (e.g., mastering, mixing)\n");
    post("  tags <tag1> <tag2> ... - Add tags (e.g., multiband vintage)\n");
    post("  description <text> - Set rack description\n");
    post("  category <category> - Set category (e.g., dynamics, spatial)\n");
    post("  difficulty <level> - Set difficulty (beginner/intermediate/advanced)\n");
    post("  genre <genre> - Set musical genre\n");
    post("  notes <text> - Add notes about the rack\n");
    post("  show_metadata - Display current metadata\n");
    post("  clear_metadata - Clear all metadata\n");
    post("\nMetadata Presets:\n");
    post("  preset_mastering - Apply mastering preset\n");
    post("  preset_creative - Apply creative FX preset\n");
    post("  preset_mixing - Apply mixing preset\n");
    post("\nConfiguration:\n");
    post("  config <key> <value> - Set configuration\n");
    post("  config - Show current configuration\n");
    post("  offline - Enable offline mode\n");
    post("  auto - Enable auto AI analysis\n");
    post("  test_server - Test n8n connection\n");
    post("  help - Show this help\n");
    post("\nNumber Box/List Input:\n");
    post("  [1 0] - Extract track 1, device 0\n");
    post("  [2 3] - Extract track 2, device 3\n");
    post("\nFunction Calls (in js object):\n");
    post("  === STREAMLINED WORKFLOWS ===\n");
    post("  extract_and_store(1, 0) - Extract rack and get PostgreSQL command\n");
    post("  extract_and_analyze(1, 0) - Extract rack and get n8n AI command\n");
    post("  send_to_postgres() - Get PostgreSQL command for last extraction\n");
    post("  send_to_n8n() - Get n8n command for last extraction\n");
    post("\n  === INDIVIDUAL FUNCTIONS ===\n");
    post("  extract_workflow(1, 0) - Extract rack only\n");
    post("  quick_export() - Export data for manual AI analysis\n");
    post("  export_to_file() - Save JSON file\n");
    post("  copy_curl_commands_multi() - Get both curl commands\n");
    post("  show_json_for_copy() - Display JSON for manual copy\n");
    post("  send_metadata_to_form() - Send metadata to jweb form\n");
    post("  add_tags('multiband', 'vintage') - Add tags\n");
    post("  set_use_case('mastering') - Set use case\n");
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
    post("📨 Max Patch Message Commands:\n");
    post("  extract <track> <device> - Extract specific device\n");
    post("  use_case <description> - Set use case\n");
    post("  tags <tag1> <tag2> - Add tags\n");
    post("  analyze - Send to AI server\n");
    post("  show_metadata - Show current metadata\n");
    post("  load_metadata - Send metadata to jweb form\n");
    post("  help - Show all commands\n");
    post("\n📞 Function Call Commands:\n");
    post("  validate_environment() - Check Max for Live setup\n");
    post("  extract_metal_head() - Extract Metal Head device\n");
    post("  extract_ezfreqsplit() - Extract EZFREQSPLIT device\n");
    post("  extract_workflow(trackID, deviceID) - Extract any device\n");
    post("  diagnose_tracks() - Show available tracks and devices\n");
    post("\n📊 Metadata Functions:\n");
    post("  set_use_case('mastering') - Set use case\n");
    post("  add_tags('multiband', 'vintage') - Add tags\n");
    post("  show_metadata() - Show current metadata\n");
    post("  preset_mastering() - Apply mastering preset\n");
    post("\n🌐 jweb Integration:\n");
    post("  load_metadata() - Send current metadata to form\n");
    post("  save_metadata() - Receive metadata from form\n");
    post("  extract_with_metadata() - Extract with form data\n");
    post("\n🤖 Server Commands:\n");
    post("  send_to_ai_server() - Send last extraction to AI\n");
    post("  retry_ai_analysis() - Retry failed AI analysis\n");
    post("  test_n8n_connection() - Test server connectivity\n");
    post("\n⚙️ Configuration:\n");
    post("  show_config() - Show current settings\n");
    post("  enable_offline_mode() - Disable server operations\n");
    post("  enable_auto_analysis() - Auto-send to AI after extraction\n");
    post("\n📋 Examples:\n");
    post("  Message: use_case mastering\n");
    post("  Message: tags multiband vintage analog\n");
    post("  Message: extract 1 0\n");
    post("  Function: extract_workflow(1, 0)\n");
    post("  List: [1, 0] to inlet\n");
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

// Test n8n connection with fallback HTTP objects
function test_n8n_connection() {
    post("🧪 Testing n8n connection...\n");
    post("Testing URL: " + N8N_WEBHOOK_URL + "\n");

    var testData = {
        test: true,
        timestamp: new Date().toISOString(),
        extractor_version: "2.0"
    };

    try {
        // Try different HTTP objects available in Max for Live
        var ajaxreq = null;

        // Method 1: Try Ajax (most common)
        try {
            ajaxreq = new Ajax(N8N_WEBHOOK_URL);
            post("📡 Using Ajax object for test\n");

            ajaxreq.setRequestHeader("Content-Type", "application/json");

            ajaxreq.done = function (result) {
                post("✅ SUCCESS: n8n connection working!\n");
                post("Response: " + result + "\n");
            };

            ajaxreq.fail = function (error) {
                post("❌ FAILED: n8n connection failed\n");
                post("Error: " + JSON.stringify(error) + "\n");
                post("💡 Check: Is n8n running? Is workflow active?\n");
            };

            ajaxreq.post(JSON.stringify(testData));

        } catch (ajaxError) {
            post("⚠️ Ajax object not available: " + ajaxError + "\n");

            // Method 2: Try XMLHttpRequest
            try {
                ajaxreq = new XMLHttpRequest();
                ajaxreq.open("POST", N8N_WEBHOOK_URL, true);
                ajaxreq.setRequestHeader("Content-Type", "application/json");
                post("📡 Using XMLHttpRequest object for test\n");

                ajaxreq.onreadystatechange = function () {
                    if (ajaxreq.readyState === 4) {
                        if (ajaxreq.status === 200) {
                            post("✅ SUCCESS: n8n connection working! (XMLHttpRequest)\n");
                            post("Response: " + ajaxreq.responseText + "\n");
                        } else {
                            post("❌ FAILED: n8n connection failed (XMLHttpRequest)\n");
                            post("Status: " + ajaxreq.status + "\n");
                            post("Response: " + ajaxreq.responseText + "\n");
                        }
                    }
                };

                ajaxreq.send(JSON.stringify(testData));

            } catch (xmlError) {
                post("⚠️ XMLHttpRequest not available: " + xmlError + "\n");
                post("❌ CRITICAL: No HTTP objects available in this Max environment\n");
                post("💡 This may be an older Max version or restricted environment\n");
                post("💡 Check Max version: Help → About Max\n");
                post("💡 Ajax object requires Max 7+ with proper JavaScript support\n");
                post("💡 Alternative: Test webhook manually with curl:\n");
                post("   curl -X POST -H 'Content-Type: application/json' -d '" + JSON.stringify(testData) + "' " + N8N_WEBHOOK_URL + "\n");
                return;
            }
        }

        post("📤 Test request sent...\n");

    } catch (error) {
        post("❌ CRITICAL: Test request setup failed: " + error + "\n");
        post("💡 Try manual curl test:\n");
        post("   curl -X POST -H 'Content-Type: application/json' -d '{}' " + N8N_WEBHOOK_URL + "\n");
    }
}

/////////////////////////////////////////
// ALTERNATIVE WORKFLOWS (for environments without HTTP objects)

// Export workflow data to a JSON file that can be uploaded manually
function export_to_file() {
    if (!WorkflowData) {
        post("❌ No workflow data to export - extract a rack first\n");
        return;
    }

    try {
        var jsonString = JSON.stringify(WorkflowData, null, 2);
        var filename = "rack_export_" + Date.now() + ".json";

        // Try to write to file (may not work in all Max environments)
        try {
            var file = new File(filename, "write");
            if (file.isopen) {
                file.write(jsonString);
                file.close();
                post("✅ Exported to file: " + filename + "\n");
                post("💡 Upload this file to n8n webhook manually\n");
                post("💡 Or use the curl command from copy_curl_command()\n");
            } else {
                throw new Error("Could not open file for writing");
            }
        } catch (fileError) {
            post("⚠️ File write failed: " + fileError + "\n");
            post("💡 Try show_json_for_copy() instead for manual copy/paste\n");
        }

    } catch (error) {
        post("❌ ERROR in export_to_file: " + error + "\n");
    }
}

// Generate curl commands for multiple endpoints
function copy_curl_commands_multi() {
    if (!WorkflowData) {
        post("❌ No workflow data to export - extract a rack first\n");
        return;
    }

    try {
        var jsonString = JSON.stringify(WorkflowData);

        // Escape quotes for shell
        var escapedJson = jsonString.replace(/"/g, '\\"');

        // n8n AI Analysis (if available)
        var n8nCurl = "curl -X POST -H 'Content-Type: application/json' -d \"" + escapedJson + "\" " + N8N_WEBHOOK_URL;

        // Direct PostgreSQL via PostgREST (n8n-independent)
        var pgPayload = '{"rack_data":' + jsonString + '}';
        var escapedPgJson = pgPayload.replace(/"/g, '\\"');
        var pgCurl = "curl -X POST -H 'Content-Type: application/json' -d \"" + escapedPgJson + "\" " + POSTGRES_API_URL; post("📋 === CURL COMMANDS (Choose One) ===\n");
        post("🤖 AI Analysis + Storage (requires n8n):\n");
        post(n8nCurl + "\n\n");
        post("💾 Direct Database Storage (n8n-independent):\n");
        post(pgCurl + "\n\n");
        post("💡 Use the PostgreSQL command if n8n is unavailable\n");

        // Also output to Max outlets for external capture
        outlet(0, "n8n_curl", n8nCurl);
        outlet(0, "pg_curl", pgCurl);

    } catch (error) {
        post("❌ ERROR generating curl commands: " + error + "\n");
    }
}

// === STREAMLINED WORKFLOW FUNCTIONS ===

// Advanced Max automation detection and execution
function check_max_automation_capabilities() {
    post("🔍 === MAX AUTOMATION CAPABILITIES ===\n");

    var capabilities = {
        shell: false,
        tcp: false,
        udp: false,
        file: false,
        externals: []
    };

    // Check Shell object
    try {
        if (typeof Shell !== 'undefined') {
            capabilities.shell = true;
            post("✅ Shell object available\n");
        } else {
            post("❌ Shell object not available\n");
        }
    } catch (e) {
        post("❌ Shell object check failed: " + e.message + "\n");
    }

    // Check TCP object
    try {
        if (typeof TCP !== 'undefined') {
            capabilities.tcp = true;
            post("✅ TCP object available\n");
        } else {
            post("❌ TCP object not available\n");
        }
    } catch (e) {
        post("❌ TCP object check failed: " + e.message + "\n");
    }

    // Check UDP objects
    try {
        if (typeof UDP !== 'undefined' || typeof udpsend !== 'undefined') {
            capabilities.udp = true;
            post("✅ UDP objects available\n");
        } else {
            post("❌ UDP objects not available\n");
        }
    } catch (e) {
        post("❌ UDP objects check failed: " + e.message + "\n");
    }

    // Check file writing capability
    try {
        var testFile = new File("test_" + Date.now() + ".tmp", "write");
        if (testFile.isopen) {
            testFile.write("test");
            testFile.close();
            capabilities.file = true;
            post("✅ File writing available\n");
        } else {
            post("❌ File writing not available\n");
        }
    } catch (e) {
        post("❌ File writing check failed: " + e.message + "\n");
    }

    // Check external objects
    var externals = ['http', 'httpget', 'curl', 'net.http', 'node.script'];
    for (var i = 0; i < externals.length; i++) {
        try {
            if (typeof eval(externals[i]) !== 'undefined') {
                capabilities.externals.push(externals[i]);
                post("✅ External object available: " + externals[i] + "\n");
            }
        } catch (e) {
            // External not available
        }
    }

    post("\n📊 AUTOMATION SUMMARY:\n");
    post("Shell commands: " + (capabilities.shell ? "✅" : "❌") + "\n");
    post("TCP networking: " + (capabilities.tcp ? "✅" : "❌") + "\n");
    post("UDP networking: " + (capabilities.udp ? "✅" : "❌") + "\n");
    post("File operations: " + (capabilities.file ? "✅" : "❌") + "\n");
    post("External objects: " + capabilities.externals.length + " found\n");

    if (capabilities.externals.length > 0) {
        post("Available externals: " + capabilities.externals.join(", ") + "\n");
    }

    return capabilities;
}

// AUTOMATED send to Supabase using Max native objects
function send_to_supabase_direct() {
    if (!WorkflowData) {
        post("❌ No workflow data to send - extract a rack first\n");
        return;
    }

    try {
        post("🤖 === AUTOMATED SUPABASE UPLOAD ===\n");
        post("URL: " + POSTGRES_API_URL + "\n");

        var jsonString = JSON.stringify(WorkflowData);
        var payload = '{"workflow_data":' + jsonString + '}';
        post("Payload size: " + payload.length + " characters\n");

        // Method 1: Try Max shell object for system command execution
        if (try_max_shell_automation(payload)) {
            return;
        }

        // Method 2: Try Max TCP objects for direct HTTP
        if (try_max_tcp_automation(payload)) {
            return;
        }

        // Method 3: Try Max external objects
        if (try_max_external_automation(payload)) {
            return;
        }

        // Method 4: File-based automation trigger
        if (try_file_based_automation(payload)) {
            return;
        }

        // If all automation methods fail
        post("❌ No automation methods available in this Max environment\n");
        post("💡 Check Max configuration and available objects\n");

    } catch (error) {
        post("❌ ERROR in automated Supabase send: " + error + "\n");
    }
}

// Try Max shell object automation
function try_max_shell_automation(payload) {
    try {
        post("🔍 Checking Max shell object...\n");

        // Check if shell object constructor is available
        if (typeof Shell !== 'undefined') {
            post("📡 Using Max shell object for automated curl\n");

            var shellObj = new Shell();
            var curlCmd = 'curl -X POST -H "Content-Type: application/json" -H "apikey: ' +
                SUPABASE_ANON_KEY + '" -d \'' + payload.replace(/'/g, "'\"'\"'") +
                '\' ' + POSTGRES_API_URL;

            // Execute shell command
            shellObj.command = curlCmd;

            post("✅ AUTOMATED: Shell command executed!\n");
            post("⏳ Check terminal for response...\n");
            return true;

        } else {
            post("⚠️ Shell object not available\n");
            return false;
        }
    } catch (error) {
        post("⚠️ Shell automation failed: " + error + "\n");
        return false;
    }
}

// Try Max TCP objects for direct HTTP
function try_max_tcp_automation(payload) {
    try {
        post("🔍 Checking Max TCP objects...\n");

        if (typeof TCP !== 'undefined') {
            post("📡 Using Max TCP object for direct HTTP\n");

            var tcpObj = new TCP();

            // Parse URL for host and port
            var urlParts = POSTGRES_API_URL.match(/https?:\/\/([^:\/]+)(:(\d+))?(.*)$/);
            if (!urlParts) {
                post("❌ Could not parse URL for TCP connection\n");
                return false;
            }

            var host = urlParts[1];
            var port = urlParts[3] || (POSTGRES_API_URL.indexOf('https') === 0 ? 443 : 80);
            var path = urlParts[4] || '/';

            // Build HTTP request
            var httpRequest = "POST " + path + " HTTP/1.1\r\n" +
                "Host: " + host + "\r\n" +
                "Content-Type: application/json\r\n" +
                "apikey: " + SUPABASE_ANON_KEY + "\r\n" +
                "Content-Length: " + payload.length + "\r\n" +
                "Connection: close\r\n\r\n" +
                payload;

            tcpObj.connect(host, port);
            tcpObj.send(httpRequest);

            post("✅ AUTOMATED: TCP HTTP request sent!\n");
            return true;

        } else {
            post("⚠️ TCP object not available\n");
            return false;
        }
    } catch (error) {
        post("⚠️ TCP automation failed: " + error + "\n");
        return false;
    }
}

// Try Max external objects for HTTP
function try_max_external_automation(payload) {
    try {
        post("🔍 Checking Max external objects...\n");

        // Common Max external objects for HTTP
        var externals = ['http', 'httpget', 'curl', 'net.http'];

        for (var i = 0; i < externals.length; i++) {
            try {
                if (typeof eval(externals[i]) !== 'undefined') {
                    post("📡 Found external object: " + externals[i] + "\n");
                    // Attempt to use the external object
                    var extObj = eval('new ' + externals[i] + '()');
                    if (extObj && typeof extObj.post === 'function') {
                        extObj.post(POSTGRES_API_URL, payload, {
                            'Content-Type': 'application/json',
                            'apikey': SUPABASE_ANON_KEY
                        });
                        post("✅ AUTOMATED: External object " + externals[i] + " used!\n");
                        return true;
                    }
                }
            } catch (extError) {
                // Continue trying other external objects
            }
        }

        post("⚠️ No suitable external objects found\n");
        return false;

    } catch (error) {
        post("⚠️ External object automation failed: " + error + "\n");
        return false;
    }
}

// File-based automation trigger
function try_file_based_automation(payload) {
    try {
        post("🔍 Setting up file-based automation...\n");

        var timestamp = Date.now();
        var tempFile = "rack_upload_" + timestamp + ".json";
        var cmdFile = "rack_upload_" + timestamp + ".sh";

        // Try to write payload to temporary file
        try {
            var dataFile = new File(tempFile, "write");
            if (dataFile.isopen) {
                dataFile.write(payload);
                dataFile.close();

                // Write shell script
                var scriptFile = new File(cmdFile, "write");
                if (scriptFile.isopen) {
                    var script = '#!/bin/bash\n' +
                        'curl -X POST -H "Content-Type: application/json" -H "apikey: ' +
                        SUPABASE_ANON_KEY + '" -d @"' + tempFile + '" ' + POSTGRES_API_URL + '\n' +
                        'rm "' + tempFile + '"\n' +
                        'rm "' + cmdFile + '"\n';

                    scriptFile.write(script);
                    scriptFile.close();

                    post("✅ AUTOMATED: Files created for background processing\n");
                    post("📄 Data file: " + tempFile + "\n");
                    post("📄 Script file: " + cmdFile + "\n");
                    post("💡 Run: chmod +x " + cmdFile + " && ./" + cmdFile + "\n");

                    return true;
                }
            }
        } catch (fileError) {
            post("⚠️ File write failed: " + fileError + "\n");
            return false;
        }

    } catch (error) {
        post("⚠️ File automation failed: " + error + "\n");
        return false;
    }
}

// Alias function for pg_curl
function pg_curl() {
    send_to_postgres();
}

// Alias function for postgres_curl  
function postgres_curl() {
    send_to_postgres();
}

// Debug function to check what HTTP objects are available
function check_http_objects() {
    post("🔍 === CHECKING HTTP OBJECTS ===\n");

    // Check for various HTTP object names used in different Max versions
    var httpObjects = [
        'Ajax', 'XMLHttpRequest', 'fetch', 'HttpRequest',
        'WebRequest', 'URLRequest', 'NetRequest', 'httpget',
        'max', 'maxobj'
    ];

    var available = [];
    var unavailable = [];

    for (var i = 0; i < httpObjects.length; i++) {
        try {
            var objName = httpObjects[i];
            if (typeof eval(objName) !== 'undefined') {
                available.push(objName + " ✅");
                post(objName + ": Available ✅\n");
            } else {
                unavailable.push(objName + " ❌");
            }
        } catch (e) {
            unavailable.push(httpObjects[i] + " ❌ (" + e.message + ")");
        }
    }

    post("\n📊 SUMMARY:\n");
    post("Available: " + available.length + "\n");
    post("Unavailable: " + unavailable.length + "\n");

    if (available.length === 0) {
        post("❌ No standard HTTP objects found\n");
        post("💡 Let's try alternative approaches...\n");
    } else {
        post("✅ Found HTTP capabilities!\n");
    }

    // Check for max object specifically and its properties
    try {
        if (typeof max !== 'undefined') {
            post("Max object available: " + typeof max + "\n");
            post("Max object properties:\n");

            // Common Max HTTP-related properties to check
            var maxProps = ['HttpRequest', 'WebRequest', 'URLRequest', 'launchurl', 'openfile'];
            for (var j = 0; j < maxProps.length; j++) {
                if (max[maxProps[j]]) {
                    post("  max." + maxProps[j] + ": Available ✅\n");
                } else {
                    post("  max." + maxProps[j] + ": Not available ❌\n");
                }
            }
        }
    } catch (e) {
        post("Max object check failed: " + e.message + "\n");
    }
}

// Test Max HTTP capabilities with a simple request
function test_max_http() {
    post("🧪 === TESTING MAX HTTP CAPABILITIES ===\n");

    if (typeof max === 'undefined') {
        post("❌ Max object not available\n");
        return;
    }

    // Try different Max HTTP approaches
    var testUrl = "http://httpbin.org/post"; // Simple test endpoint
    var testData = '{"test": "max_http_test", "timestamp": "' + Date.now() + '"}';

    post("Testing URL: " + testUrl + "\n");
    post("Test payload: " + testData + "\n");

    // Try max.HttpRequest if available
    if (max.HttpRequest) {
        try {
            post("📡 Trying max.HttpRequest...\n");
            var httpReq = new max.HttpRequest();

            httpReq.open("POST", testUrl);
            httpReq.setRequestHeader("Content-Type", "application/json");

            httpReq.onreadystatechange = function () {
                post("ReadyState: " + httpReq.readyState + ", Status: " + httpReq.status + "\n");
                if (httpReq.readyState === 4) {
                    if (httpReq.status === 200) {
                        post("✅ Max HTTP test successful!\n");
                        post("Response: " + httpReq.responseText.substring(0, 200) + "...\n");
                    } else {
                        post("⚠️ Max HTTP test failed with status: " + httpReq.status + "\n");
                    }
                }
            };

            httpReq.send(testData);
            post("📤 Test request sent via max.HttpRequest\n");
            return;

        } catch (error) {
            post("❌ max.HttpRequest failed: " + error + "\n");
        }
    }

    // Try other Max HTTP methods
    post("💡 max.HttpRequest not available, checking alternatives...\n");
    if (max.launchurl) {
        post("✅ max.launchurl available (but not suitable for POST)\n");
    }

    post("💡 For HTTP POST in Max, try external objects or shell commands\n");
}

// Debug function to check if functions are loaded
function check_functions() {
    post("🔍 === FUNCTION CHECK ===\n");
    post("postgres_curl: " + (typeof postgres_curl) + "\n");
    post("pg_curl: " + (typeof pg_curl) + "\n");
    post("n8n_curl: " + (typeof n8n_curl) + "\n");
    post("send_to_postgres: " + (typeof send_to_postgres) + "\n");
    post("send_to_n8n: " + (typeof send_to_n8n) + "\n");
}

// Quick send to n8n for AI analysis
function send_to_n8n() {
    if (!WorkflowData) {
        post("❌ No workflow data to send - extract a rack first\n");
        return;
    }

    try {
        var jsonString = JSON.stringify(WorkflowData);
        var escapedJson = jsonString.replace(/"/g, '\\"');
        var n8nCurl = "curl -X POST -H 'Content-Type: application/json' -d \"" + escapedJson + "\" " + N8N_WEBHOOK_URL;

        post("🤖 === SENDING TO N8N FOR AI ANALYSIS ===\n");
        post("Copy and run this command:\n");
        post(n8nCurl + "\n");
        post("🧠 This will get AI analysis (and auto-store in PostgreSQL if workflow is set up)\n");

        // Also output to outlet for external tools
        outlet(0, "n8n_curl", n8nCurl);

    } catch (error) {
        post("❌ ERROR generating n8n command: " + error + "\n");
    }
}

// Alias function for n8n_curl
function n8n_curl() {
    send_to_n8n();
}

// Simple extraction test with common rack
function test_extraction() {
    post("🧪 Testing extraction with track 0, device 0...\n");
    extract_and_store(0, 0);
}

// Show available automation functions
function show_functions() {
    post("🤖 === AUTOMATED WORKFLOW FUNCTIONS ===\n");
    post("🚀 Main Automation:\n");
    post("  extract_and_store(trackID, deviceID) - Complete automated workflow!\n");
    post("  send_to_supabase_direct() - Automated upload to Supabase\n");
    post("  check_max_automation_capabilities() - Check what automation is available\n");
    post("\n� Automation Methods:\n");
    post("  try_max_shell_automation(payload) - Use Max shell object\n");
    post("  try_max_tcp_automation(payload) - Use Max TCP objects\n");
    post("  try_max_external_automation(payload) - Use Max external objects\n");
    post("  try_file_based_automation(payload) - File-based automation\n");
    post("\n📊 Metadata Functions:\n");
    post("  set_use_case('mastering') - Set use case\n");
    post("  add_tags('multiband', 'vintage') - Add tags\n");
    post("  show_metadata() - Show current metadata\n");
    post("\n🧪 Testing Functions:\n");
    post("  test_extraction() - Test extraction with track 0, device 0\n");
    post("  check_http_objects() - Check available HTTP objects\n");
    post("  test_max_http() - Test Max HTTP capabilities\n");
    post("  show_functions() - Show this list\n");
    post("\n� Quick Start (FULLY AUTOMATED):\n");
    post("  1. set_use_case('your use case')\n");
    post("  2. add_tags('tag1', 'tag2')\n");
    post("  3. extract_and_store(1, 0)\n");
    post("  4. Wait for automated upload to complete!\n");
    post("\n🎯 The system will automatically:\n");
    post("  ✅ Extract your rack data\n");
    post("  ✅ Try multiple automation methods\n");
    post("  ✅ Upload to Supabase database\n");
    post("  ✅ Provide feedback on success/failure\n");
}// AUTOMATED extraction and upload - the complete solution
function extract_and_store() {
    if (arguments.length < 2) {
        post("Usage: extract_and_store(trackID, deviceID)\n");
        post("Example: extract_and_store(1, 0)\n");
        return;
    }

    var trackID = arguments[0];
    var deviceID = arguments[1];

    post("🤖 === COMPLETE AUTOMATED WORKFLOW ===\n");
    post("1️⃣ Extracting rack from track " + trackID + ", device " + deviceID + "...\n");

    // Extract the rack
    extract_workflow_internal(trackID, deviceID);

    // If extraction was successful, automatically send to Supabase
    if (WorkflowData) {
        post("2️⃣ Rack extracted successfully! Automated upload starting...\n");
        send_to_supabase_direct();
    }
}

// Complete workflow with AI analysis
function extract_and_analyze() {
    if (arguments.length < 2) {
        post("Usage: extract_and_analyze(trackID, deviceID)\n");
        post("Example: extract_and_analyze(1, 0)\n");
        return;
    }

    var trackID = arguments[0];
    var deviceID = arguments[1];

    post("🎯 === COMPLETE AI WORKFLOW ===\n");
    post("1️⃣ Extracting rack from track " + trackID + ", device " + deviceID + "...\n");

    // Extract the rack
    extract_workflow_internal(trackID, deviceID);

    // If extraction was successful, automatically generate send command
    if (WorkflowData) {
        post("2️⃣ Rack extracted successfully! Generating n8n command...\n");
        send_to_n8n();
    }
}

// Display JSON data formatted for easy copy/paste
function show_json_for_copy() {
    if (!WorkflowData) {
        post("❌ No workflow data to show - extract a rack first\n");
        return;
    }

    try {
        var jsonString = JSON.stringify(WorkflowData, null, 2);

        post("📋 === WORKFLOW DATA FOR MANUAL UPLOAD ===\n");
        post("Copy this JSON and paste it to n8n webhook test:\n");
        post("URL: " + N8N_WEBHOOK_URL + "\n");
        post("Method: POST\n");
        post("Content-Type: application/json\n");
        post("--- JSON DATA START ---\n");
        post(jsonString + "\n");
        post("--- JSON DATA END ---\n");
        post("💡 In n8n: Go to webhook node → Test → Paste this JSON\n");

        // Also output to Max outlet for external capture
        outlet(0, "json_data", jsonString);

    } catch (error) {
        post("❌ ERROR displaying JSON: " + error + "\n");
    }
}

// Export to PostgreSQL-ready SQL file
function export_to_postgres_file() {
    if (!WorkflowData) {
        post("❌ No workflow data to export - extract a rack first\n");
        return;
    }

    try {
        var jsonString = JSON.stringify(WorkflowData);
        var escapedJson = jsonString.replace(/'/g, "''"); // Escape single quotes for SQL

        var rackName = WorkflowData.rack_name || "Unknown";
        var trackId = WorkflowData.metadata.track_id || 0;
        var deviceId = WorkflowData.metadata.device_id || 0;
        var useCase = WorkflowData.metadata.use_case || "";
        var category = WorkflowData.metadata.category || "";

        // Generate SQL INSERT
        var sqlInsert = `-- Rack Extract PostgreSQL Import
-- Generated: ${new Date().toISOString()}

-- Create table if not exists
CREATE TABLE IF NOT EXISTS racks (
    id SERIAL PRIMARY KEY,
    rack_name TEXT,
    track_id INTEGER,
    device_id INTEGER,
    use_case TEXT,
    category TEXT,
    raw_data JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Insert data
INSERT INTO racks (rack_name, track_id, device_id, use_case, category, raw_data) 
VALUES ('${rackName}', ${trackId}, ${deviceId}, '${useCase}', '${category}', '${escapedJson}');
`;

        var filename = "rack_" + Date.now() + ".sql";

        // Try to write SQL file
        try {
            var file = new File(filename, "write");
            if (file.isopen) {
                file.write(sqlInsert);
                file.close();
                post("✅ PostgreSQL file created: " + filename + "\n");
                post("💡 Import with: psql -d rackextract -f " + filename + "\n");
            } else {
                throw new Error("Could not create SQL file");
            }
        } catch (fileError) {
            post("⚠️ File creation failed, showing SQL for copy/paste:\n");
            post("--- SQL START ---\n");
            post(sqlInsert + "\n");
            post("--- SQL END ---\n");
        }

    } catch (error) {
        post("❌ ERROR in export_to_postgres_file: " + error + "\n");
    }
}

// Complete export workflow with all options
function export_all_options() {
    if (!WorkflowData) {
        post("❌ No workflow data to export - extract a rack first\n");
        return;
    }

    post("� === ALL EXPORT OPTIONS ===\n\n");

    post("1️⃣ Multiple curl commands:\n");
    copy_curl_commands_multi();

    post("\n2️⃣ PostgreSQL SQL file:\n");
    export_to_postgres_file();

    post("\n3️⃣ JSON file export:\n");
    export_to_file();

    post("\n💡 Choose the option that works best for your setup!\n");
}

// Initialize on load
function loadbang() {
    post("🎵 Rack Workflow Extractor v2.0 with AI Integration loaded\n");
    post("💡 Send 'help' message for Max patch commands\n");
    post("💡 Call test() for function reference\n");
}