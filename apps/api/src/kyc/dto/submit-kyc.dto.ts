import { IsString, IsOptional, IsDateString, IsObject } from 'class-validator';

export class SubmitKycDto {
  @IsString()
  fullName: string;

  @IsDateString()
  dateOfBirth: string;

  @IsString()
  address: string;

  @IsString()
  city: string;

  @IsString()
  country: string;

  @IsString()
  postalCode: string;

  @IsString()
  documentType: string;

  @IsString()
  documentNumber: string;

  @IsOptional()
  @IsString()
  documentFrontUrl?: string;

  @IsOptional()
  @IsString()
  documentBackUrl?: string;

  @IsOptional()
  @IsString()
  selfieUrl?: string;

  @IsOptional()
  @IsObject()
  metadata?: any;
}
