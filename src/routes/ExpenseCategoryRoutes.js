import { Router } from 'express';
import * as ExpenseCategoryController from '../controllers/ExpenseCategoryController.js';
import VerifyFirebaseToken from '../middlewares/VerifyFirebaseToken.js';
import CheckLicense from '../middlewares/CheckLicense.js';
import RequireRole from '../middlewares/RequireRole.js';

const router = Router();

router.get(
  '/api/expense-categories',
  VerifyFirebaseToken,
  CheckLicense,
  RequireRole(['admin', 'owner']),
  ExpenseCategoryController.list
);
router.post(
  '/api/expense-categories',
  VerifyFirebaseToken,
  CheckLicense,
  RequireRole(['admin']),
  ExpenseCategoryController.create
);
router.put(
  '/api/expense-categories/:id',
  VerifyFirebaseToken,
  CheckLicense,
  RequireRole(['admin']),
  ExpenseCategoryController.update
);
router.delete(
  '/api/expense-categories/:id',
  VerifyFirebaseToken,
  CheckLicense,
  RequireRole(['admin']),
  ExpenseCategoryController.remove
);

export default router;
