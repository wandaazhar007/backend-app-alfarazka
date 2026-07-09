import { Router } from 'express';
import * as ProductController from '../controllers/ProductController.js';
import VerifyFirebaseToken from '../middlewares/VerifyFirebaseToken.js';
import CheckLicense from '../middlewares/CheckLicense.js';
import RequireRole from '../middlewares/RequireRole.js';

const router = Router();

router.get('/api/products', VerifyFirebaseToken, CheckLicense, RequireRole(['admin', 'owner']), ProductController.list);
router.post('/api/products', VerifyFirebaseToken, CheckLicense, RequireRole(['admin']), ProductController.create);
router.put('/api/products/:id', VerifyFirebaseToken, CheckLicense, RequireRole(['admin']), ProductController.update);

export default router;
