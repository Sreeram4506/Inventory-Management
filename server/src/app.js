import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { notFound, errorHandler } from './middlewares/errorMiddleware.js';

import authRoutes from './routes/authRoutes.js';
import vehicleRoutes from './routes/vehicleRoutes.js';
import saleRoutes from './routes/saleRoutes.js';
import repairRoutes from './routes/repairRoutes.js';
import expenseRoutes from './routes/expenseRoutes.js';
import advertisingRoutes from './routes/advertisingRoutes.js';
import documentRoutes from './routes/documentRoutes.js';

const app = express();

// Set security HTTP headers
app.use(helmet());

// Logging
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
} else {
  // Use combined format for production
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
app.use(express.json({ limit: '10mb' }));

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
app.use('/api', documentRoutes);

// Custom error handling middleware
app.use(notFound);
app.use(errorHandler);

export default app;
