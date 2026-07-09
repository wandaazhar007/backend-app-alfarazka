import { Router } from 'express';
import * as ProductCategoryController from '../controllers/ProductCategoryController.js';
import VerifyFirebaseToken from '../middlewares/VerifyFirebaseToken.js';
import CheckLicense from '../middlewares/CheckLicense.js';
import RequireRole from '../middlewares/RequireRole.js';

const router = Router();

router.get(
  '/api/product-categories',
  VerifyFirebaseToken,
  CheckLicense,
  RequireRole(['admin', 'owner']),
  ProductCategoryController.list
);
router.post(
  '/api/product-categories',
  VerifyFirebaseToken,
  CheckLicense,
  RequireRole(['admin']),
  ProductCategoryController.create
);
router.put(
  '/api/product-categories/:id',
  VerifyFirebaseToken,
  CheckLicense,
  RequireRole(['admin']),
  ProductCategoryController.update
);

export default router;
