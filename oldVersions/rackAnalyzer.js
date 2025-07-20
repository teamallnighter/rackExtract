// rackAnalyzer.js - V8 Object Script for Live API Access
// This runs in Max's internal JavaScript environment with LiveAPI access

// Configuration
const MAX_DEPTH = 10;

// State tracking
var analyzedDevices = [];

// Initialize
function loadbang() {
    post("Rack Analyzer V8 Script Loaded");
    post("LiveAPI should be available in this environment");

    // Test LiveAPI availability
    try {
        var testAPI = new LiveAPI("live_set");
        post("✅ LiveAPI is available in V8 environment");
        post("Live Set ID: " + testAPI.id);
    } catch (e) {
        post("❌ LiveAPI not available: " + e.message);
    }
}

// Individual function definitions (required for direct Max message routing)
function status() {
    // Handle status messages (no-op for now, just prevent "no function" errors)
    post("V8 status message received");
}

function v8_request() {
    // Handle v8_request messages using arguments
    var args = arrayfromargs(arguments);
    post("V8 v8_request function called with args: [" + args.join(", ") + "]");

    // Process the command
    if (args.length >= 1) {
        var command = args[0];

        if (command === "analyze_with_discovery" && args.length >= 3) {
            var trackID = args[1];
            var deviceID = args[2];
            post("V8 analyze_with_discovery: trackID=" + trackID + ", deviceID=" + deviceID);
            analyze_with_discovery(trackID, deviceID);
        } else if (command === "analyze_path" && args.length >= 2) {
            var fullPath = args.slice(1).join(' ');
            post("V8 analyze_path: " + fullPath);
            analyze_path(fullPath);
        } else if (command === "test") {
            post("V8 test command executed");
            outlet(0, "test_response", "V8 is working");
        } else if (command === "test_live_api") {
            post("V8 test_live_api command executed");
            test_live_api();
        } else if (command === "discover_paths") {
            post("V8 discover_paths command executed");
            discover_paths();
        } else {
            post("V8 unknown command: " + command);
        }
    } else {
        post("V8 v8_request called with no arguments");
    }
}

// Main analysis function - called from Node script (simple track/device format)
function analyze_request(trackID, deviceID) {
    post("=== V8 RACK ANALYSIS START (Simple Format) ===");
    post("Track ID: " + trackID + ", Device ID: " + deviceID);

    // Build simple path and call the main analyzer
    var simplePath = "live_set tracks " + trackID + " devices " + deviceID;
    analyze_path(simplePath);
}

// Enhanced analysis function - discovers nested paths automatically
function analyze_path(fullPath) {
    post("=== V8 RACK ANALYSIS START (Full Path) ===");
    post("Full LiveAPI Path: " + fullPath);

    try {
        // Clear previous analysis
        analyzedDevices = [];

        // Validate LiveAPI access first
        post("Testing LiveAPI access...");
        var liveSet = new LiveAPI("live_set");
        if (!liveSet || liveSet.id === '0') {
            throw new Error('Cannot access Live Set - is Live running and Max4Live enabled?');
        }
        post("Live Set accessible, ID: " + liveSet.id);

        // Validate the full path by testing it directly
        post("Testing full path: " + fullPath);
        var pathAPI = new LiveAPI(fullPath);

        if (!pathAPI || pathAPI.id === '0') {
            // Path failed, let's try to validate it step by step
            post("Full path failed, attempting step-by-step validation...");
            validatePathStepByStep(fullPath);
            throw new Error('Cannot access device at path: ' + fullPath);
        }

        var deviceName = pathAPI.get('name');
        var deviceType = pathAPI.get('class_name');
        post("✅ Device found at path: " + deviceName + " (" + deviceType + ")");
        post("Device ID: " + pathAPI.id);

        // Start recursive analysis from this nested location
        var rackData = analyzeRack(fullPath, 0);

        // Send result back to Node script
        outlet(0, "rack_analysis_result", JSON.stringify(rackData));
        post("✅ Analysis complete, data sent to Node script");

    } catch (error) {
        post("❌ Analysis failed: " + error.message);
        outlet(0, "analysis_error", error.message);
    }
}

// Auto-discovery function - extracts complete workflows from racks
function analyze_with_discovery(trackID, deviceID) {
    post("=== WORKFLOW EXTRACTION & ANALYSIS ===");
    post("🎯 Extracting complete workflow from Track " + trackID + ", Device " + deviceID);
    post("This will create a reusable workflow template for AI training...");
    post("");
    post("📍 IMPORTANT: trackID and deviceID are INDICES (0-based), not Live Object IDs!");
    post("   Example: Track 1 = second track, Device 0 = first device");
    post("   Your path will be: live_set tracks " + trackID + " devices " + deviceID);

    try {
        // Clear previous analysis
        analyzedDevices = [];

        // Validate LiveAPI access first
        post("Testing LiveAPI access...");
        var liveSet = new LiveAPI("live_set");
        if (!liveSet || liveSet.id === '0') {
            throw new Error('Cannot access Live Set - is Live running and Max4Live enabled?');
        }
        post("Live Set accessible, ID: " + liveSet.id);

        // Build initial path to the workflow rack
        var workflowPath = "live_set tracks " + trackID + " devices " + deviceID;
        post("🔍 Scanning workflow at: " + workflowPath);

        // Validate the path exists before proceeding
        post("🔍 Validating track " + trackID + " exists...");
        var trackAPI = new LiveAPI("live_set tracks " + trackID);
        if (!trackAPI || trackAPI.id === '0') {
            post("❌ Track " + trackID + " does not exist!");
            post("💡 HINT: trackID should be the track INDEX (0-based), not the Live Object ID");
            post("💡 If your device is on the second track, use trackID: 1");
            post("💡 Run 'test_live_api' to see all available tracks");
            throw new Error('Track ' + trackID + ' does not exist');
        }

        var trackName = trackAPI.get('name');
        var trackDevices = parseInt(trackAPI.get('devices'));
        post("✅ Track " + trackID + " found: '" + trackName + "' (" + trackDevices + " devices)");

        if (deviceID >= trackDevices) {
            post("❌ Device " + deviceID + " does not exist on track " + trackID + "!");
            post("💡 Track '" + trackName + "' only has " + trackDevices + " devices (0-" + (trackDevices - 1) + ")");
            post("💡 HINT: deviceID should be the device INDEX (0-based), not the Live Object ID");
            post("💡 If you want the first device, use deviceID: 0");
            throw new Error('Device ' + deviceID + ' does not exist on track ' + trackID + ' (only has ' + trackDevices + ' devices)');
        }

        post("🔍 Validating device " + deviceID + " on track " + trackID + "...");
        var deviceAPI = new LiveAPI(workflowPath);
        if (!deviceAPI || deviceAPI.id === '0') {
            throw new Error('Cannot access device at path: ' + workflowPath);
        }

        var deviceName = deviceAPI.get('name');
        var deviceType = deviceAPI.get('class_name');
        post("✅ Device found: '" + deviceName + "' (" + deviceType + ")");
        post("✅ Live Object ID: " + deviceAPI.id + " (this is different from the index!)");

        // Extract the complete workflow structure
        var workflowData = extractWorkflow(workflowPath);

        post("=== WORKFLOW EXTRACTION COMPLETE ===");
        post("📋 Workflow Name: " + workflowData.name);
        post("🔧 Total Processing Steps: " + workflowData.processingSteps.length);
        post("📊 Workflow Complexity: " + workflowData.complexity);
        post("🎛️ Total Configurable Parameters: " + workflowData.totalParameters);

        // Display workflow summary
        post("=== WORKFLOW SUMMARY ===");
        for (var i = 0; i < workflowData.processingSteps.length; i++) {
            var step = workflowData.processingSteps[i];
            post("Step " + (i + 1) + ": " + step.name + " (" + step.role + ")");
        }

        // Send the complete workflow data back to Node script
        outlet(0, "rack_analysis_result", JSON.stringify(workflowData));
        post("✅ Workflow extraction complete - ready for AI knowledge base!");

    } catch (error) {
        post("❌ Workflow extraction failed: " + error.message);
        outlet(0, "analysis_error", error.message);
    }
}

// Extract complete workflow - THIS IS THE MAIN EXTRACTION FUNCTION
function extractWorkflow(workflowPath) {
    post("🔍 EXTRACTING WORKFLOW FROM: " + workflowPath);

    try {
        // Test if the path exists
        var api = new LiveAPI(workflowPath);
        if (!api || api.id === '0') {
            throw new Error('Cannot access workflow at path: ' + workflowPath);
        }

        var workflowName = api.get('name');
        var workflowType = api.get('class_name');

        post("📋 Workflow: " + workflowName + " (" + workflowType + ")");

        // Discover all devices in this workflow
        post("🔍 Discovering all devices in workflow...");
        var discoveredDevices = discoverNestedDevices(workflowPath, 0);

        post("✅ Found " + discoveredDevices.length + " devices in workflow");

        // Create workflow structure
        var workflow = {
            name: workflowName,
            type: workflowType,
            path: workflowPath,
            deviceId: api.id,
            totalDevices: discoveredDevices.length,
            processingSteps: [],
            complexity: "Low",
            totalParameters: 0,
            signalFlow: [],
            replicationInstructions: null,
            extractionTimestamp: new Date().toISOString()
        };

        // Convert discovered devices to processing steps
        for (var i = 0; i < discoveredDevices.length; i++) {
            var device = discoveredDevices[i];
            var step = {
                stepNumber: i + 1,
                name: device.name,
                type: device.type,
                role: determineDeviceRole(device.type, device.name),
                path: device.path,
                depth: device.depth,
                canHaveChains: device.canHaveChains,
                parameters: extractDeviceParameters(device.path)
            };

            workflow.processingSteps.push(step);
            workflow.totalParameters += step.parameters.length;
        }

        // Set complexity based on device count and nesting
        var maxDepth = Math.max.apply(Math, discoveredDevices.map(function (d) { return d.depth; }));
        if (discoveredDevices.length > 10 || maxDepth > 3) {
            workflow.complexity = "High";
        } else if (discoveredDevices.length > 5 || maxDepth > 2) {
            workflow.complexity = "Medium";
        }

        // Generate replication instructions
        workflow.replicationInstructions = generateReplicationInstructions(discoveredDevices);

        post("✅ WORKFLOW EXTRACTION COMPLETE");
        post("   Total Devices: " + workflow.totalDevices);
        post("   Total Parameters: " + workflow.totalParameters);
        post("   Complexity: " + workflow.complexity);

        return workflow;

    } catch (extractError) {
        post("❌ Workflow extraction failed: " + extractError.message);
        throw extractError;
    }
}

// Extract parameters from a specific device
function extractDeviceParameters(devicePath) {
    var parameters = [];

    try {
        var api = new LiveAPI(devicePath);
        if (!api || api.id === '0') {
            return parameters;
        }

        var paramsCount = parseInt(api.get('parameters'));
        var maxParams = Math.min(paramsCount, 20); // Limit to avoid overwhelming data

        for (var p = 1; p < maxParams; p++) {
            try {
                var paramPath = devicePath + " parameters " + p;
                var paramApi = new LiveAPI(paramPath);

                var param = {
                    name: paramApi.get('name'),
                    value: parseFloat(paramApi.get('value')),
                    min: parseFloat(paramApi.get('min')),
                    max: parseFloat(paramApi.get('max')),
                    default: parseFloat(paramApi.get('default_value')),
                    isModified: false
                };

                // Check if parameter is modified from default
                param.isModified = Math.abs(param.value - param.default) > 0.001;

                parameters.push(param);
            } catch (paramError) {
                // Skip problematic parameters
            }
        }

    } catch (deviceError) {
        post("Parameter extraction failed for " + devicePath + ": " + deviceError.message);
    }

    return parameters;
}

// Recursively discover all devices in a nested rack structure
function discoverNestedDevices(startPath, depth) {
    var discoveredDevices = [];

    if (depth > MAX_DEPTH) {
        post("Max depth reached during discovery at: " + startPath);
        return discoveredDevices;
    }

    try {
        var api = new LiveAPI(startPath);

        if (!api || api.id === '0') {
            return discoveredDevices;
        }

        var deviceName = api.get('name');
        var deviceType = api.get('class_name');

        // Add this device to discovered devices
        discoveredDevices.push({
            path: startPath,
            name: deviceName,
            type: deviceType,
            depth: depth,
            canHaveChains: parseInt(api.get('can_have_chains')) === 1
        });

        post("Discovered: " + deviceName + " (" + deviceType + ") at depth " + depth);

        // If this device can have chains, explore them
        var canHaveChains = parseInt(api.get('can_have_chains'));
        if (canHaveChains === 1) {
            var chainsCount = parseInt(api.get('chains'));
            post("Device has " + chainsCount + " chains to explore");

            for (var chainIdx = 0; chainIdx < chainsCount; chainIdx++) {
                var chainPath = startPath + " chains " + chainIdx;

                try {
                    var chainAPI = new LiveAPI(chainPath);
                    var devicesInChain = parseInt(chainAPI.get('devices'));

                    post("Chain " + chainIdx + " has " + devicesInChain + " devices");

                    for (var deviceIdx = 0; deviceIdx < devicesInChain; deviceIdx++) {
                        var nestedDevicePath = chainPath + " devices " + deviceIdx;

                        // Recursively discover devices in this nested structure
                        var nestedDevices = discoverNestedDevices(nestedDevicePath, depth + 1);
                        discoveredDevices = discoveredDevices.concat(nestedDevices);
                    }
                } catch (chainError) {
                    post("Error exploring chain " + chainIdx + ": " + chainError.message);
                }
            }
        }

    } catch (discoveryError) {
        post("Discovery error at " + startPath + ": " + discoveryError.message);
    }

    return discoveredDevices;
}

// Find the most interesting device to analyze from discovered devices
function findTargetDevice(discoveredDevices) {
    if (discoveredDevices.length === 0) {
        throw new Error('No devices discovered');
    }

    // Strategy 1: Find the deepest nested rack
    var deepestRack = null;
    var maxDepth = -1;

    for (var i = 0; i < discoveredDevices.length; i++) {
        var device = discoveredDevices[i];
        if (device.canHaveChains && device.depth > maxDepth) {
            deepestRack = device;
            maxDepth = device.depth;
        }
    }

    if (deepestRack) {
        post("Selected deepest nested rack: " + deepestRack.name + " at depth " + deepestRack.depth);
        return deepestRack;
    }

    // Strategy 2: Find the first rack that can have chains
    for (var j = 0; j < discoveredDevices.length; j++) {
        var device2 = discoveredDevices[j];
        if (device2.canHaveChains) {
            post("Selected first rack with chains: " + device2.name);
            return device2;
        }
    }

    // Strategy 3: Return the first device
    post("Selected first discovered device: " + discoveredDevices[0].name);
    return discoveredDevices[0];
}

// Create a workflow map for AI training and replication
function createWorkflowMap(discoveredDevices) {
    var workflowMap = {
        entryPoint: null,
        processingChain: [],
        deviceTypes: {},
        signalFlow: []
    };

    // Find entry point (shallowest device)
    var minDepth = 999;
    for (var i = 0; i < discoveredDevices.length; i++) {
        if (discoveredDevices[i].depth < minDepth) {
            minDepth = discoveredDevices[i].depth;
            workflowMap.entryPoint = discoveredDevices[i];
        }
    }

    // Create processing chain ordered by depth
    workflowMap.processingChain = discoveredDevices.slice().sort(function (a, b) {
        return a.depth - b.depth;
    });

    // Count device types for pattern recognition
    for (var j = 0; j < discoveredDevices.length; j++) {
        var device = discoveredDevices[j];
        var deviceType = device.type || 'Unknown';

        if (!workflowMap.deviceTypes[deviceType]) {
            workflowMap.deviceTypes[deviceType] = {
                count: 0,
                names: [],
                depths: []
            };
        }

        workflowMap.deviceTypes[deviceType].count++;
        workflowMap.deviceTypes[deviceType].names.push(device.name);
        workflowMap.deviceTypes[deviceType].depths.push(device.depth);
    }

    // Create signal flow description
    for (var k = 0; k < workflowMap.processingChain.length; k++) {
        var flowDevice = workflowMap.processingChain[k];
        workflowMap.signalFlow.push({
            step: k + 1,
            device: flowDevice.name,
            type: flowDevice.type,
            depth: flowDevice.depth,
            path: flowDevice.path,
            role: determineDeviceRole(flowDevice.type, flowDevice.name)
        });
    }

    return workflowMap;
}

// Generate step-by-step replication instructions
function generateReplicationInstructions(discoveredDevices) {
    var instructions = {
        overview: "Workflow Replication Instructions",
        totalSteps: discoveredDevices.length,
        steps: [],
        requiredDevices: [],
        estimatedComplexity: "Medium"
    };

    // Extract unique device types needed
    var uniqueDevices = {};
    for (var i = 0; i < discoveredDevices.length; i++) {
        var device = discoveredDevices[i];
        var deviceType = device.type || device.name;
        if (!uniqueDevices[deviceType]) {
            uniqueDevices[deviceType] = {
                name: deviceType,
                count: 0,
                examples: []
            };
        }
        uniqueDevices[deviceType].count++;
        uniqueDevices[deviceType].examples.push(device.name);
    }

    // Convert to array for instructions
    for (var deviceType in uniqueDevices) {
        instructions.requiredDevices.push(uniqueDevices[deviceType]);
    }

    // Generate step-by-step instructions
    var sortedDevices = discoveredDevices.slice().sort(function (a, b) {
        return a.depth - b.depth;
    });

    for (var j = 0; j < sortedDevices.length; j++) {
        var stepDevice = sortedDevices[j];
        var stepInstruction = {
            step: j + 1,
            action: "Add " + stepDevice.name,
            device_type: stepDevice.type,
            location: "Depth " + stepDevice.depth,
            path_reference: stepDevice.path,
            notes: generateDeviceNotes(stepDevice)
        };

        instructions.steps.push(stepInstruction);
    }

    // Set complexity based on device count and nesting
    var maxDepth = Math.max.apply(Math, discoveredDevices.map(function (d) { return d.depth; }));
    if (discoveredDevices.length > 10 || maxDepth > 3) {
        instructions.estimatedComplexity = "High";
    } else if (discoveredDevices.length > 5 || maxDepth > 2) {
        instructions.estimatedComplexity = "Medium";
    } else {
        instructions.estimatedComplexity = "Low";
    }

    return instructions;
}

// Determine the role of a device in the workflow
function determineDeviceRole(deviceType, deviceName) {
    var name = (deviceName || "").toLowerCase();
    var type = (deviceType || "").toLowerCase();

    // Audio processing roles
    if (name.indexOf('eq') !== -1 || name.indexOf('equalizer') !== -1) return "EQ/Filtering";
    if (name.indexOf('comp') !== -1 || name.indexOf('compress') !== -1) return "Dynamics/Compression";
    if (name.indexOf('reverb') !== -1 || name.indexOf('delay') !== -1) return "Time-based Effects";
    if (name.indexOf('distort') !== -1 || name.indexOf('saturate') !== -1) return "Saturation/Distortion";
    if (name.indexOf('filter') !== -1) return "Filtering";
    if (name.indexOf('gate') !== -1) return "Gating";
    if (name.indexOf('limit') !== -1) return "Limiting";

    // Rack types
    if (type.indexOf('rack') !== -1) return "Container/Rack";
    if (type.indexOf('chain') !== -1) return "Signal Routing";

    return "Processing";
}

// Generate helpful notes for device replication
function generateDeviceNotes(device) {
    var notes = [];

    if (device.canHaveChains) {
        notes.push("This is a rack device - configure internal routing");
    }

    if (device.depth > 2) {
        notes.push("Deeply nested - ensure proper signal flow");
    }

    if (device.name && device.name.toLowerCase().indexOf('custom') !== -1) {
        notes.push("Custom settings - may require manual parameter adjustment");
    }

    return notes.length > 0 ? notes.join("; ") : "Standard device configuration";
}// Helper function to validate nested paths step by step
function validatePathStepByStep(fullPath) {
    post("=== STEP-BY-STEP PATH VALIDATION ===");

    var pathSegments = fullPath.split(' ');
    var currentPath = '';

    for (var i = 0; i < pathSegments.length; i += 2) {
        if (i + 1 < pathSegments.length) {
            currentPath += pathSegments[i] + ' ' + pathSegments[i + 1];

            try {
                var testAPI = new LiveAPI(currentPath);
                if (testAPI && testAPI.id !== '0') {
                    var name = testAPI.get('name') || 'unnamed';
                    post("✅ Valid: " + currentPath + " -> " + name + " (ID: " + testAPI.id + ")");

                    // If this is a device, show additional info
                    if (currentPath.indexOf('devices') !== -1) {
                        try {
                            var className = testAPI.get('class_name');
                            var canHaveChains = parseInt(testAPI.get('can_have_chains'));
                            var chains = canHaveChains ? parseInt(testAPI.get('chains')) : 0;
                            post("    Device info: " + className + ", Can have chains: " + canHaveChains + ", Chains: " + chains);
                        } catch (infoError) {
                            post("    Device info unavailable: " + infoError.message);
                        }
                    }

                    // If this is a chain, show device count
                    if (currentPath.indexOf('chains') !== -1) {
                        try {
                            var devices = parseInt(testAPI.get('devices'));
                            post("    Chain has " + devices + " devices");
                        } catch (chainError) {
                            post("    Chain device count unavailable: " + chainError.message);
                        }
                    }
                } else {
                    post("❌ INVALID: " + currentPath + " -> ID is 0 or null");
                    break;
                }
            } catch (stepError) {
                post("❌ ERROR: " + currentPath + " -> " + stepError.message);
                break;
            }

            if (i + 2 < pathSegments.length) {
                currentPath += ' ';
            }
        }
    }
}// Recursive rack analysis function
function analyzeRack(path, depth) {
    if (depth > MAX_DEPTH) {
        return {
            type: 'rack',
            name: 'Max depth reached',
            error: 'Maximum nesting depth exceeded',
            depth: depth
        };
    }

    post("Analyzing device at path: " + path + " (depth: " + depth + ")");

    var api = new LiveAPI(path);

    if (!api || api.id === '0') {
        throw new Error('Invalid device path: ' + path);
    }

    var deviceId = api.id;

    // Check for circular reference
    if (analyzedDevices.indexOf(deviceId) !== -1) {
        return {
            type: 'rack',
            name: api.get('name'),
            circularReference: true,
            referenceId: deviceId,
            depth: depth
        };
    }

    analyzedDevices.push(deviceId);

    // Build basic device data
    var rackData = {
        type: parseInt(api.get('type')),
        name: api.get('name'),
        class_name: api.get('class_name'),
        deviceId: deviceId,
        depth: depth,
        chains: [],
        macros: [],
        timestamp: new Date().toISOString()
    };

    post("Device: " + rackData.name + " (" + rackData.class_name + ")");

    // Check if it's a rack (can have chains)
    var canHaveChains = parseInt(api.get('can_have_chains'));
    if (canHaveChains === 1) {
        var chainsCount = parseInt(api.get('chains'));
        post("Rack has " + chainsCount + " chains");

        // Analyze each chain
        for (var i = 0; i < chainsCount; i++) {
            var chainPath = path + " chains " + i;
            try {
                var chainData = analyzeChain(chainPath, depth + 1);
                rackData.chains.push(chainData);
            } catch (chainError) {
                post("Chain " + i + " analysis failed: " + chainError.message);
                rackData.chains.push({
                    name: "Chain " + i,
                    error: chainError.message,
                    devices: []
                });
            }
        }

        // Get macro information
        for (var m = 1; m <= 8; m++) {
            try {
                var macroName = api.get('macro_name ' + m);
                if (macroName && macroName !== '') {
                    rackData.macros.push({
                        index: m,
                        name: macroName,
                        mappings: [] // TODO: implement macro mappings
                    });
                }
            } catch (macroError) {
                // Ignore macro errors
            }
        }
    } else {
        post("Device is not a rack, no chains to analyze");
    }

    return rackData;
}

// Analyze individual chain
function analyzeChain(chainPath, depth) {
    post("Analyzing chain: " + chainPath);

    var api = new LiveAPI(chainPath);

    var chain = {
        name: api.get('name'),
        devices: [],
        mixer: {}
    };

    // Get mixer settings
    try {
        chain.mixer = {
            volume: parseFloat(api.get('mixer_device volume value')),
            panning: parseFloat(api.get('mixer_device panning value')),
            mute: parseInt(api.get('mixer_device activator value')) === 0
        };
    } catch (mixerError) {
        post("Mixer data unavailable for chain: " + chainPath);
        chain.mixer = {
            volume: 1.0,
            panning: 0.0,
            mute: false
        };
    }

    // Get devices in chain
    var devicesCount = parseInt(api.get('devices'));
    post("Chain has " + devicesCount + " devices");

    for (var d = 0; d < devicesCount; d++) {
        var devicePath = chainPath + " devices " + d;
        try {
            var deviceApi = new LiveAPI(devicePath);

            // Check if this device is also a rack
            var deviceCanHaveChains = parseInt(deviceApi.get('can_have_chains'));

            if (deviceCanHaveChains === 1) {
                // It's a nested rack
                var nestedRack = analyzeRack(devicePath, depth);
                nestedRack.isNested = true;
                chain.devices.push(nestedRack);
            } else {
                // Regular device
                var device = analyzeDevice(devicePath);
                chain.devices.push(device);
            }

        } catch (deviceError) {
            post("Device " + d + " analysis failed: " + deviceError.message);
            chain.devices.push({
                name: "Device " + d,
                error: deviceError.message,
                parameters: []
            });
        }
    }

    return chain;
}

// Analyze regular device (not a rack)
function analyzeDevice(devicePath) {
    var api = new LiveAPI(devicePath);

    var device = {
        type: parseInt(api.get('type')),
        name: api.get('name'),
        class_name: api.get('class_name'),
        deviceId: api.id,
        parameters: []
    };

    // Get device parameters
    try {
        var paramsCount = parseInt(api.get('parameters'));

        // Limit parameter extraction to avoid overwhelming data
        var maxParams = Math.min(paramsCount, 50);

        for (var p = 1; p < maxParams; p++) {
            try {
                var paramPath = devicePath + " parameters " + p;
                var paramApi = new LiveAPI(paramPath);

                var param = {
                    name: paramApi.get('name'),
                    value: parseFloat(paramApi.get('value')),
                    min: parseFloat(paramApi.get('min')),
                    max: parseFloat(paramApi.get('max')),
                    default: parseFloat(paramApi.get('default_value'))
                };

                device.parameters.push(param);
            } catch (paramError) {
                // Skip problematic parameters
            }
        }

        post("Device " + device.name + " has " + device.parameters.length + " parameters");

    } catch (paramError) {
        post("Parameter extraction failed for " + device.name + ": " + paramError.message);
    }

    return device;
}

// Handle messages from Node script
function anything() {
    var message = messagename;
    var args = arrayfromargs(arguments);

    // DEBUG: Show ALL messages received (don't filter anything initially)
    post("V8 DEBUG: Received message '" + message + "' with args: [" + args.join(", ") + "]");

    // Only filter out bang messages (keep status and error for debugging)
    if (message === "bang") {
        return; // Ignore bang messages only
    }

    post("V8 Processing: " + message + " " + args.join(" "));

    if (message === "v8_request") {
        // Parse the actual command from the arguments
        if (args.length >= 1) {
            var command = args[0];

            post("V8 Command: " + command);

            if (command === "analyze_request" && args.length >= 3) {
                var trackID = args[1];
                var deviceID = args[2];
                post("V8 Starting analyze_request with trackID:" + trackID + ", deviceID:" + deviceID);
                analyze_request(trackID, deviceID);
            } else if (command === "analyze_with_discovery" && args.length >= 3) {
                var trackID = args[1];
                var deviceID = args[2];
                post("V8 Starting analyze_with_discovery with trackID:" + trackID + ", deviceID:" + deviceID);
                analyze_with_discovery(trackID, deviceID);
            } else if (command === "analyze_path" && args.length >= 2) {
                // Join all remaining arguments to form the complete path
                var fullPath = args.slice(1).join(' ');
                post("V8 Starting analyze_path with path:" + fullPath);
                analyze_path(fullPath);
            } else if (command === "test") {
                post("V8 test successful");
                outlet(0, "test_response", "V8 is working");
            } else if (command === "test_live_api") {
                post("V8 Starting LiveAPI test");
                test_live_api();
            } else if (command === "discover_paths") {
                post("V8 Starting path discovery");
                discover_paths();
            } else {
                post("V8 unknown v8_request command: " + command + " (args count: " + args.length + ")");
            }
        } else {
            post("V8 v8_request received but no arguments");
        }
    } else if (message === "anal