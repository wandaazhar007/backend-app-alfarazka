import { Router } from 'express';
import * as AuditLogController from '../controllers/AuditLogController.js';
import VerifyFirebaseToken from '../middlewares/VerifyFirebaseToken.js';
import CheckLicense from '../middlewares/CheckLicense.js';
import RequireRole from '../middlewares/RequireRole.js';

const router = Router();

router.get('/api/audit-logs', VerifyFirebaseToken, CheckLicense, RequireRole(['owner']), AuditLogController.list);

export default router;
