import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import { notFound, errorHandler } from './middlewares/errorMiddleware.js';

import authRoutes from './routes/authRoutes.js';
import vehicleRoutes from './routes/vehicleRoutes.js';
import saleRoutes from './routes/saleRoutes.js';
import repairRoutes from './routes/repairRoutes.js';
import expenseRoutes from './routes/expenseRoutes.js';
import advertisingRoutes from './routes/advertisingRoutes.js';
import documentRoutes from './routes/documentRoutes.js';
import registryRoutes from './routes/registryRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import teamRoutes from './routes/teamRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import noteRoutes from './routes/noteRoutes.js';


const app = express();

// Enable ETags for conditional GET responses — saves bandwidth on repeated requests
app.set('etag', 'strong');

// Set security HTTP headers with custom CSP for PDF blob support
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "script-src": ["'self'", "'unsafe-inline'"],
      "img-src": ["'self'", "data:", "blob:"],
      "frame-src": ["'self'", "blob:"],
      "connect-src": ["'self'", "blob:", "data:"],
      "object-src": ["'self'", "blob:", "data:"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// Enable compression with smart filtering —
// skip compression for already-compressed binary data (PDFs, images)
app.use(compression({
  threshold: 1024,  // Only compress responses > 1KB
  filter: (req, res) => {
    // Don't compress document download responses (already binary)
    if (req.path.includes('/document')) return false;
    return compression.filter(req, res);
  },
}));

// Logging — use 'tiny' format in dev for less noise
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('tiny'));
} else {
  app.use(morgan('combined'));
}

// Enable CORS securely (can replace '*' with specific origins in production)
app.use(cors({
  origin: process.env.CLIENT_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  credentials: true
}));

// Rate limiting to prevent brute-force attacks
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // limit each IP to 500 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
});
app.use('/api/', apiLimiter);

// Body parser
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.get('/api/ping', (req, res) => {
  res.status(200).send('Server alive');
});

// Health Check
app.get('/', (req, res) => {
  res.json({ message: 'Auto Profit Hub API is running' });
});

// Mount routers
app.use('/api/auth', authRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/sales', saleRoutes);
app.use('/api/repairs', repairRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/advertising', advertisingRoutes);
app.use('/api/registry', registryRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/notes', noteRoutes);

app.use('/api', documentRoutes);

// Custom error handling middleware
app.use(notFound);
app.use(errorHandler);

export default app;
