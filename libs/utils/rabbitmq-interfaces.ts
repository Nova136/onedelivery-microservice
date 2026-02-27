


// Response returned from payment microservice for { cmd: 'payment.process' }
export interface PaymentProcessResponse {
  success: boolean;
  transactionId: string | null;
  paymentId?: string;
  orderId?: string;
  status?: string;
  amount?: number;
  message?: string;
}

// Request payload for audit.log messages
export interface AuditLogRequest {
  action: string;
  entityType: string;
  entityId: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

// Response returned from audit microservice for { cmd: 'audit.log' }
export interface AuditLogResponse {
  auditId: string;
  action: string;
  entityType: string;
  entityId: string;
  timestamp: string;
  message: string;
}
