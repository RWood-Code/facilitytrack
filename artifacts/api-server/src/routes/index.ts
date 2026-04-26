import { Router, type IRouter } from "express";
import { requireAuth } from "../middleware/auth";
import healthRouter from "./health";
import authRouter from "./auth";
import { licenseRouter, requireValidLicense } from "./license";
import facilitiesRouter from "./facilities";
import poolsRouter from "./pools";
import testResultsRouter from "./testResults";
import waterBalanceRouter from "./waterBalance";
import poolClosuresRouter from "./poolClosures";
import steamRoomRouter from "./steamRoom";
import workOrdersRouter from "./workOrders";
import assetsRouter from "./assets";
import maintenanceRouter from "./maintenance";
import staffRouter from "./staff";
import notificationsRouter from "./notifications";
import appUsersRouter from "./appUsers";
import dashboardRouter from "./dashboard";
import complianceDocumentsRouter from "./complianceDocuments";
import settingsRouter from "./settings";
import assetAttachmentsRouter from "./assetAttachments";
import auditLogsRouter from "./auditLogs";
import backupRouter from "./backup";

const router: IRouter = Router();

router.use(healthRouter);
router.use(licenseRouter);
router.use(authRouter);

// Block all subsequent routes when the licence is invalid/expired.
router.use(requireValidLicense);
router.use(requireAuth);

router.use(facilitiesRouter);
router.use(poolsRouter);
router.use(testResultsRouter);
router.use(waterBalanceRouter);
router.use(poolClosuresRouter);
router.use(steamRoomRouter);
router.use(workOrdersRouter);
router.use(assetsRouter);
router.use(maintenanceRouter);
router.use(staffRouter);
router.use(notificationsRouter);
router.use(appUsersRouter);
router.use(dashboardRouter);
router.use(complianceDocumentsRouter);
router.use(settingsRouter);
router.use(assetAttachmentsRouter);
router.use(auditLogsRouter);
router.use(backupRouter);

export default router;
