const Max = require('max-api');
const https = require('https');

// Configuration
const SERVER_URL = 'https://your-server.com/api/racks';
const MAX_DEPTH = 10;

// State
let currentTrackDevice = null;
let currentRackData = null;
let currentMetadata = null;
let analyzedDevices = new Set();

// Main handlers - all inputs come through message handlers
Max.addHandler('analyze', async () => {
    try {
        if (!currentTrackDevice) {
            Max.outlet('error', 'No track/device info provided');
            return;
        }
        
        const path = `live_set tracks ${currentTrackDevice.trackID} devices ${currentTrackDevice.deviceID}`;
        Max.outlet('status', `Analyzing: ${currentTrackDevice.deviceName} on ${currentTrackDevice.trackName}`);
        
        analyzedDevices.clear();
        currentRackData = await analyzeRack(path, 0);
        
        // Add track info
        currentRackData.trackInfo = { ...currentTrackDevice };
        
        Max.outlet('rack_data', JSON.stringify(currentRackData));
        Max.outlet('status', 'Analysis complete');
    } catch (error) {
        Max.outlet('error', `Analysis failed: ${error.message}`);
    }
});

// Receive track/device JSON as string
Max.addHandler('trackDevice', (jsonString) => {
    try {
        currentTrackDevice = JSON.parse(jsonString);
        Max.outlet('status', 'Track/Device info received');
    } catch (error) {
        Max.outlet('error', 'Invalid track/device JSON');
    }
});

// Receive metadata JSON as string
Max.addHandler('metadata', (jsonString) => {
    try {
        currentMetadata = JSON.parse(jsonString);
        Max.outlet('status', 'Metadata received');
    } catch (error) {
        Max.outlet('error', 'Invalid metadata JSON');
    }
});

Max.addHandler('send', async () => {
    try {
        await sendToServer();
    } catch (error) {
        Max.outlet('error', `Send failed: ${error.message}`);
    }
});

Max.addHandler('clear', () => {
    currentTrackDevice = null;
    currentRackData = null;
    currentMetadata = null;
    analyzedDevices.clear();
    Max.outlet('status', 'Data cleared');
});

// Recursive rack analysis
async function analyzeRack(path, depth = 0) {
    if (depth > MAX_DEPTH) {
        return {
            type: 'rack',
            name: 'Max depth reached',
            error: 'Maximum nesting depth exceeded'
        };
    }
    
    const api = new Max.LiveAPI(path);
    
    if (!api || api.id === '0') {
        throw new Error('Invalid device path');
    }
    
    const deviceId = api.id;
    if (analyzedDevices.has(deviceId)) {
        return {
            type: 'rack',
            name: api.get('name'),
            circularReference: true,
            referenceId: deviceId
        };
    }
    analyzedDevices.add(deviceId);
    
    const rackData = {
        type: api.get('type'),
        name: api.get('name'),
        class_name: api.get('class_name'),
        deviceId,
        depth,
        chains: [],
        macros: [],
        timestamp: new Date().toISOString()
    };
    
    // Check if it's a rack
    if (api.get('can_have_chains') === 1) {
        const chainsCount = parseInt(api.get('chains'));
        
        // Analyze each chain
        for (let i = 0; i < chainsCount; i++) {
            const chainPath = `${path} chains ${i}`;
            const chainData = await analyzeChain(chainPath, depth + 1);
            rackData.chains.push(chainData);
        }
        
        // Get macro mappings
        for (let m = 1; m <= 8; m++) {
            const macroName = api.get(`macro_name ${m}`);
            const mappings = getMacroMappings(api, m);
            
            if (mappings.length > 0) {
                rackData.macros.push({
                    index: m,
                    name: macroName,
                    mappings
                });
            }
        }
    }
    
    return rackData;
}

// Analyze chain with nested rack support
async function analyzeChain(chainPath, depth) {
    const api = new Max.LiveAPI(chainPath);
    
    const chain = {
        name: api.get('name'),
        devices: [],
        mixer: {
            volume: parseFloat(api.get('mixer_device volume value')),
            panning: parseFloat(api.get('mixer_device panning value')),
            mute: api.get('mixer_device activator value') === 0
        }
    };
    
    const devicesCount = parseInt(api.get('devices'));
    
    for (let d = 0; d < devicesCount; d++) {
        const devicePath = `${chainPath} devices ${d}`;
        const deviceApi = new Max.LiveAPI(devicePath);
        
        // Check if device is a rack
        if (deviceApi.get('can_have_chains') === 1) {
            const nestedRack = await analyzeRack(devicePath, depth);
            nestedRack.isNested = true;
            chain.devices.push(nestedRack);
        } else {
            // Regular device
            const device = {
                type: deviceApi.get('type'),
                name: deviceApi.get('name'),
                class_name: deviceApi.get('class_name'),
                parameters: []
            };
            
            // Get all parameters
            const paramsCount = parseInt(deviceApi.get('parameters'));
            
            for (let p = 1; p < paramsCount; p++) {
                const paramPath = `${devicePath} parameters ${p}`;
                const paramApi = new Max.LiveAPI(paramPath);
                
                const param = {
                    name: paramApi.get('name'),
                    value: parseFloat(paramApi.get('value')),
                    min: parseFloat(paramApi.get('min')),
                    max: parseFloat(paramApi.get('max')),
                    default: parseFloat(paramApi.get('default_value'))
                };
                
                device.parameters.push(param);
            }
            
            chain.devices.push(device);
        }
    }
    
    return chain;
}

// Get macro mappings
function getMacroMappings(api, macroIndex) {
    // Implementation depends on Live API capabilities
    // This is a placeholder
    return [];
}

// Send to server
async function sendToServer() {
    if (!currentRackData) {
        throw new Error('No rack data to send - run analyze first');
    }
    
    if (!currentMetadata) {
        throw new Error('No metadata provided');
    }
    
    // Validate metadata
    if (!currentMetadata.name || !currentMetadata.useCase || !currentMetadata.tags) {
        throw new Error('Missing required metadata fields');
    }
    
    const payload = {
        rack: currentRackData,
        metadata: {
            name: currentMetadata.name,
            useCase: currentMetadata.useCase,
            tags: currentMetadata.tags,
            creator: currentMetadata.creator || 'Anonymous',
            version: '1.0'
        },
        created: new Date().toISOString()
    };
    
    // Send via https module
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(payload);
        const url = new URL(SERVER_URL);
        
        const options = {
            hostname: url.hostname,
            port: url.port || 443,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        };
        
        const req = https.request(options, (res) => {
            let responseData = '';
            
            res.on('data', (chunk) => {
                responseData += chunk;
            });
            
            res.on('end', () => {
                if (res.statusCode === 200) {
                    Max.outlet('success', 'Rack saved successfully');
                    Max.outlet('response', responseData);
                    resolve(responseData);
                } else {
                    reject(new Error(`Server error: ${res.statusCode}`));
                }
            });
        });
        
        req.on('error', (e) => {
            reject(e);
        });
        
        req.write(data);
        req.end();
    });
}

// Initialize
Max.post('Rack Analyzer V8 ready');
Max.outlet('status', 'Ready');