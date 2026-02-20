import fs from 'fs';

export class StringDecoder {
    constructor() {
        this.pattern_cache = {};
        this.decoded_strings = [];
    }
    
    decode_escapes(text) {
        return text
            .replace(/\\([0-7]{1,3})/g, (match, num) => String.fromCharCode(parseInt(num, 8)))
            .replace(/\\x([0-9a-fA-F]{2})/g, (match, num) => String.fromCharCode(parseInt(num, 16)))
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '\r')
            .replace(/\\t/g, '\t')
            .replace(/\\"/g, '"')
            .replace(/\\'/g, "'")
            .replace(/\\\\/g, '\\');
    }
    
    find_string_tables(content) {
        const patterns = [
            /local\s+(\w+)\s*=\s*\{([^}]+)\}/g,
            /(\w+)\s*=\s*\{([^}]+)\}/g,
            /table\.create.*?\{([^}]+)\}/g
        ];
        
        const results = [];
        
        for (const pattern of patterns) {
            const matches = content.matchAll(pattern);
            for (const match of matches) {
                const table_name = match[1] || "unnamed";
                const table_content = match[2] || match[1];
                
                if (table_content.includes('"') || table_content.includes("'")) {
                    results.push({
                        name: table_name,
                        content: table_content,
                        type: 'string_table'
                    });
                }
            }
        }
        
        return results;
    }
    
    processFile(filepath) {
        const content = fs.readFileSync(filepath, 'utf-8');
        
        const analysis = {
            file: filepath,
            size: content.length,
            tables_found: this.find_string_tables(content),
            strings: []
        };
        
        const string_matches = content.matchAll(/["'](.*?)["']/g);
        for (const match of string_matches) {
            analysis.strings.push({
                original: match[0],
                decoded: this.decode_escapes(match[0]),
                position: match.index
            });
        }
        
        return analysis;
    }
}

export class PatternDetector {
    constructor() {
        this.patterns = {
            'base64': /[A-Za-z0-9+/]+={0,2}/g,
            'hex': /[0-9A-Fa-f]{8,}/g,
            'obfuscated_call': /\w+\([^)]*\)/g,
            'encoded_array': /\[[^\]]+\]/g
        };
    }
    
    detect(content) {
        const detections = [];
        
        for (const [pattern_name, pattern] of Object.entries(this.patterns)) {
            const matches = content.matchAll(pattern);
            for (const match of matches) {
                if (match[0].length > 6) {
                    detections.push({
                        type: pattern_name,
                        match: match[0],
                        position: match.index
                    });
                }
            }
        }
        
        return detections;
    }
              }
