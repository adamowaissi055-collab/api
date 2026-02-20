import fs from 'fs';
import crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class ScriptProcessor {
    constructor() {
        this.results = {};
    }
    
    generate_harness(lua_code, mode = "analysis") {
        return `
local analysis_mode = "${mode}"
local start_time = os.clock()

local function log_event(event_type, data)
    print(string.format("[ANALYSIS] %s: %s", event_type, data))
end

local execution_env = {}
setmetatable(execution_env, {
    __index = function(t, k)
        if k == "print" then
            return function(...)
                local args = {...}
                local output = table.concat(args, "\\t")
                log_event("PRINT", output)
            end
        end
        return nil
    end
})

${lua_code}

local execution_time = os.clock() - start_time
log_event("COMPLETION", string.format("Execution time: %.3f seconds", execution_time))
`;
    }
    
    async executeWithLua(lua_code) {
        try {
            const result = await execAsync(`lua -e "${lua_code.replace(/"/g, '\\"')}"`);
            
            return {
                success: true,
                stdout: result.stdout,
                stderr: result.stderr,
                returncode: 0
            };
        } catch (error) {
            return {
                success: false,
                stdout: error.stdout || '',
                stderr: error.stderr || error.message,
                returncode: error.code || -1
            };
        }
    }
    
    extractFunctions(content) {
        const patterns = [
            /function\s+(\w+)\(([^)]*)\)/g,
            /local\s+function\s+(\w+)\(([^)]*)\)/g,
            /(\w+)\s*=\s*function\(([^)]*)\)/g
        ];
        
        const functions = [];
        
        for (const pattern of patterns) {
            const matches = content.matchAll(pattern);
            for (const match of matches) {
                functions.push({
                    name: match[1],
                    params: match[2] ? match[2].split(',').map(p => p.trim()) : [],
                    signature: match[0]
                });
            }
        }
        
        return functions;
    }
    
    calculateMetrics(content) {
        const lines = content.split('\n');
        
        return {
            line_count: lines.length,
            char_count: content.length,
            function_count: this.extractFunctions(content).length,
            hash_md5: crypto.createHash('md5').update(content).digest('hex'),
            hash_sha256: crypto.createHash('sha256').update(content).digest('hex'),
            avg_line_length: lines.reduce((sum, line) => sum + line.length, 0) / lines.length
        };
    }
    
    processScript(filepath) {
        const content = fs.readFileSync(filepath, 'utf-8');
        
        return {
            file: filepath,
            metrics: this.calculateMetrics(content),
            functions: this.extractFunctions(content),
            analysis_timestamp: Date.now()
        };
    }
}
