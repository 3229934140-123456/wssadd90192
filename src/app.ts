import express from 'express';
import { responseFormatter, requestLogger } from './middleware/responseFormatter';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import customerRoutes from './routes/customerRoutes';
import wordRoutes from './routes/wordRoutes';
import wordPackageRoutes from './routes/wordPackageRoutes';
import notificationRuleRoutes from './routes/notificationRuleRoutes';
import alertRoutes from './routes/alertRoutes';
import auditRoutes from './routes/auditRoutes';

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(requestLogger);
app.use(responseFormatter);

app.get('/health', (req, res) => {
  res.success(
    {
      status: 'ok',
      timestamp: Date.now(),
      service: 'sentiment-alert-service',
      version: '1.0.0',
    },
    '服务运行正常'
  );
});

app.use('/api/customers', customerRoutes);
app.use('/api/customers', wordRoutes);
app.use('/api/customers', wordPackageRoutes);
app.use('/api/customers', notificationRuleRoutes);
app.use('/api/customers', auditRoutes);
app.use('/api/alerts', alertRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
