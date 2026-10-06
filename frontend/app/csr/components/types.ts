export type LinkStatus =
  | "pending"
  | "completed"
  | "important"
  | "followup"
  | "noresponse";

export interface LinkData {
  id: number;
  company: string;
  contact: string;
  phone: string;
  email: string;
  status: LinkStatus;
  notes: string;
  lastCall: string;
}