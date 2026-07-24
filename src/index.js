import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import authRoutes from './routes/AuthRoutes.js';
import branchRoutes from './routes/BranchRoutes.js';
import userRoutes from './routes/UserRoutes.js';
import productRoutes from './routes/ProductRoutes.js';
import productCategoryRoutes from './routes/ProductCategoryRoutes.js';
import sellerRoutes from './routes/SellerRoutes.js';
import expenseCategoryRoutes from './routes/ExpenseCategoryRoutes.js';
import stockMovementRoutes from './routes/StockMovementRoutes.js';
import salesRoutes from './routes/SalesRoutes.js';
import qrisSettlementRoutes from './routes/QrisSettlementRoutes.js';
import reportRoutes from './routes/ReportRoutes.js';
import expenseRoutes from './routes/ExpenseRoutes.js';
import dailyClosingRoutes from './routes/DailyClosingRoutes.js';
import customerRoutes from './routes/CustomerRoutes.js';
import receivableRoutes from './routes/ReceivableRoutes.js';
import auditLogRoutes from './routes/AuditLogRoutes.js';
import licenseRoutes from './routes/LicenseRoutes.js';
import sellerDebtRoutes from './routes/SellerDebtRoutes.js';
import sellerPayrollRoutes from './routes/SellerPayrollRoutes.js';
import sellerLocationRoutes from './routes/SellerLocationRoutes.js';
import pushTokenRoutes from './routes/PushTokenRoutes.js';
import { startLicenseCron } from './services/LicenseCron.js';
import { startDailyClosingCron } from './services/DailyClosingCron.js';
import { startSetoranReminderCron } from './services/SetoranReminderCron.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.use(authRoutes);
app.use(branchRoutes);
app.use(userRoutes);
app.use(productRoutes);
app.use(productCategoryRoutes);
app.use(sellerRoutes);
app.use(expenseCategoryRoutes);
app.use(stockMovementRoutes);
app.use(salesRoutes);
app.use(qrisSettlementRoutes);
app.use(reportRoutes);
app.use(expenseRoutes);
app.use(dailyClosingRoutes);
app.use(customerRoutes);
app.use(receivableRoutes);
app.use(auditLogRoutes);
app.use(licenseRoutes);
app.use(sellerDebtRoutes);
app.use(sellerPayrollRoutes);
app.use(sellerLocationRoutes);
app.use(pushTokenRoutes);

startLicenseCron();
startDailyClosingCron();
startSetoranReminderCron();

app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }
  console.error(err);
  res.status(err.status ?? 500).json({
    error: err.error ?? 'INTERNAL_ERROR',
    message: err.message ?? 'Terjadi kesalahan pada server',
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
