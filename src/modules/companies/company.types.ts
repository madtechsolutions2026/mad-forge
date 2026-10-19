export interface CreateCompanyInput {
  name: string;
  address: string | null;
  phone: string | null;
}

export interface Company extends CreateCompanyInput {
  id: string;
  created_at: Date;
  updated_at: Date;
}
