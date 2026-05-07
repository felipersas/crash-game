import { IsString, IsNotEmpty } from 'class-validator';

export class HealthCheckResponseDto {
  @IsString()
  @IsNotEmpty()
  status!: string;

  @IsString()
  @IsNotEmpty()
  service!: string;
}
