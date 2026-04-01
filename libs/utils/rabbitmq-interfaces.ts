
export interface insert_audit_record_interface {
  UserId: string;
  ActionTaken: string;
  IsSuccess: boolean;
  Data: string;
}

export interface update_audit_record_interface {
  userId: string;
}

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

export interface PaymentOrderResponse {
    found: boolean;
    paymentId: string;
    orderId: string;
    status: string;
    amount: number;
    refunds: {id: string; amount: number;}[];
    message: string;
}

export interface PaymentRefundResponse {
    refundId: string;
    paymentId: string;
    status: string;
    amount: number;
    message: string;
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

// Request payload for incident.log messages
export interface LogIncidentRequest {
  type: string;
  summary: string;
  orderId?: string;
}

// Response returned from incident microservice for { cmd: 'incident.log' }
export interface LogIncidentResponse {
  incidentId: string;
  type: string;
  summary: string;
  timestamp: string;
  message: string;
}
