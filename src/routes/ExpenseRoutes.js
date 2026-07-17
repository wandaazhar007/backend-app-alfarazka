import { Router } from 'express';
import * as ExpenseController from '../controllers/ExpenseController.js';
import VerifyFirebaseToken from '../middlewares/VerifyFirebaseToken.js';
import CheckLicense from '../middlewares/CheckLicense.js';
import RequireRole from '../middlewares/RequireRole.js';

const router = Router();

router.get('/api/expenses', VerifyFirebaseToken, CheckLicense, RequireRole(['admin', 'owner']), ExpenseController.list);
router.get(
  '/api/expenses/export',
  VerifyFirebaseToken,
  CheckLicense,
  RequireRole(['admin', 'owner']),
  ExpenseController.exportExpenses
);
router.post('/api/expenses', VerifyFirebaseToken, CheckLicense, RequireRole(['admin']), ExpenseController.create);
router.put('/api/expenses/:id', VerifyFirebaseToken, CheckLicense, RequireRole(['admin']), ExpenseController.update);
router.delete('/api/expenses/:id', VerifyFirebaseToken, CheckLicense, RequireRole(['admin']), ExpenseController.remove);

export default router;
