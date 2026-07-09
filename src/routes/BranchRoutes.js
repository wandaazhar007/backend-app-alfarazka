import { Router } from 'express';
import * as BranchController from '../controllers/BranchController.js';
import VerifyFirebaseToken from '../middlewares/VerifyFirebaseToken.js';
import CheckLicense from '../middlewares/CheckLicense.js';
import RequireRole from '../middlewares/RequireRole.js';

const router = Router();

router.get('/api/branches', VerifyFirebaseToken, CheckLicense, RequireRole(['owner']), BranchController.list);
router.post('/api/branches', VerifyFirebaseToken, CheckLicense, RequireRole(['owner']), BranchController.create);

export default router;
