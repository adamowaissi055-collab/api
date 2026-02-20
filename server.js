import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import multer from 'multer';
import { SandboxEngine } from './sandbox_engine.js';
import { StringDecoder, PatternDetector } from './string_analyzer.js';
import { ScriptProcessor } from './script_processor.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(morgan('combined'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

const analyzers = {
  sandbox: new SandboxEngine(),
  stringDecoder: new StringDecoder(),
  patternDetector: new PatternDetector(),
  scriptProcessor: new ScriptProcessor()
};

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

app.post('/api/execute', async (req, res) => {
  try {
    const { code, timeout = 8 } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'No code provided' });
    }
    
    const engine = new SandboxEngine();
    engine.initialize();
    
    const [success, result, trace_log] = await engine.execute_lua(code, timeout);
    
    res.json({
      success,
      result,
      trace: trace_log,
      execution_time: Date.now() / 1000 - engine.start_time
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/analyze', upload.single('file'), async (req, res) => {
  try {
    let content = req.body.code;
    let filename = req.body.filename || 'script.lua';
    
    if (req.file) {
      content = req.file.buffer.toString('utf-8');
      filename = req.file.originalname;
    }
    
    if (!content) {
      return res.status(400).json({ error: 'No code or file provided' });
    }
    
    const mode = req.body.mode || 'full';
    const results = {};
    
    if (mode === 'strings' || mode === 'full') {
      results.strings = analyzers.stringDecoder.find_string_tables(content);
    }
    
    if (mode === 'patterns' || mode === 'full') {
      results.patterns = analyzers.patternDetector.detect(content);
    }
    
    if (mode === 'metrics' || mode === 'full') {
      results.metrics = analyzers.scriptProcessor.calculateMetrics(content);
      results.functions = analyzers.scriptProcessor.extractFunctions(content);
    }
    
    if (mode === 'execute' || mode === 'full') {
      results.execution = await analyzers.scriptProcessor.executeWithLua(content);
    }
    
    res.json({
      filename,
      mode,
      results,
      analysis_time: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/analyze/batch', upload.array('files', 50), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    
    const results = [];
    
    for (const file of req.files) {
      const content = file.buffer.toString('utf-8');
      
      results.push({
        filename: file.originalname,
        size: file.size,
        metrics: analyzers.scriptProcessor.calculateMetrics(content),
        functions: analyzers.scriptProcessor.extractFunctions(content),
        patterns: analyzers.patternDetector.detect(content)
      });
    }
    
    res.json({
      files_processed: results.length,
      results,
      batch_time: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/stats', (req, res) => {
  res.json({
    uptime: process.uptime(),
    memory_usage: process.memoryUsage(),
    version: '1.0.0'
  });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
