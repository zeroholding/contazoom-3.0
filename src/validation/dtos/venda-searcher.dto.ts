import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from "class-validator";
import { Transform, Type } from "class-transformer";

export class DataVendaDTO {
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  min?: Date;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  max?: Date;
}

enum LogisticTypeOptions {
  FULL = "fulfillment",
  FLEX = "flex",
  AGENCIA = "agencia",
  RETIRADA = "drop_off"
}

enum ExposicaoOptions {
  PREMIUM = "premium",
  CLASSICO = "classico",
}

enum AnuncioOptions {
  CATALOGO = "catalogo",
  PROPRIO = "proprio",
}

enum StatusOptions {
  PAGO = "paid",
  CANCELADO = "cancelled",
}

class vendaSearcherValidationDTO {
  status?: StatusOptions
  accountId?: string;
  dataVenda?: {
    min?: Date;
    max?: Date;
  };
  logisticType?: LogisticTypeOptions;
  ads?: boolean;
  anuncio?: AnuncioOptions;
  exposicao?: ExposicaoOptions;
}

export class VendaSearcherValidationDTO implements vendaSearcherValidationDTO {
  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DataVendaDTO)
  dataVenda?: DataVendaDTO;

  @IsOptional()
  @IsEnum(StatusOptions)
  status?: StatusOptions;
  
  @IsOptional()
  @IsEnum(LogisticTypeOptions)
  logisticType?: LogisticTypeOptions;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === "true")
  ads?: boolean;

  @IsOptional()
  @IsEnum(AnuncioOptions)
  anuncio?: AnuncioOptions;

  @IsOptional()
  @IsEnum(ExposicaoOptions)
  exposicao?: ExposicaoOptions;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10;
}
