/*************  Auditlog Service  ************/


export interface insert_audit_record_interface {
  UserId: string;
  ActionTaken: string;
  IsSuccess: boolean;
  Data: string;
}

export interface update_audit_record_interface {
  userId: string;
}
