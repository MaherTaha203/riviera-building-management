import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import dashboardRouter from "./dashboard";
import unitsRouter from "./units";
import tenantsRouter from "./tenants";
import contractsRouter from "./contracts";
import receiptVouchersRouter from "./receiptVouchers";
import paymentVouchersRouter from "./paymentVouchers";
import cashFundRouter from "./cashFund";
import bankAccountsRouter from "./bankAccounts";
import chequesRouter from "./cheques";
import accountStatementsRouter from "./accountStatements";
import documentsRouter from "./documents";
import auditLogRouter from "./auditLog";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(dashboardRouter);
router.use(unitsRouter);
router.use(tenantsRouter);
router.use(contractsRouter);
router.use(receiptVouchersRouter);
router.use(paymentVouchersRouter);
router.use(cashFundRouter);
router.use(bankAccountsRouter);
router.use(chequesRouter);
router.use(accountStatementsRouter);
router.use(documentsRouter);
router.use(auditLogRouter);
router.use(settingsRouter);

export default router;
