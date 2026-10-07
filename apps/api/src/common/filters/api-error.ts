import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { Response } from 'express';

export function apiError(status: number, code: string, message: string): HttpException {
  return new HttpException({ code, message }, status);
}
export class ApiErrorDto {
  @ApiProperty({ example: 403 }) statusCode!: number;
  @ApiProperty({ example: 'FORBIDDEN' }) code!: string;
  @ApiProperty({ example: 'No tienes permiso para esta operación.' }) message!: string;
}
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const payload = exception instanceof HttpException ? exception.getResponse() : undefined;
    const detail = typeof payload === 'object' && payload !== null ? payload as Record<string, unknown> : {};
    const defaults: Record<number, string> = {
      400: 'VALIDATION_ERROR', 401: 'UNAUTHORIZED', 403: 'FORBIDDEN',
      404: 'NOT_FOUND', 409: 'CONFLICT',
    };
    const message = typeof detail.message === 'string' ? detail.message
      : Array.isArray(detail.message) ? detail.message.join('; ')
      : typeof payload === 'string' ? payload : 'Error interno del servidor.';
    host.switchToHttp().getResponse<Response>().status(status).json({
      statusCode: status, code: detail.code ?? defaults[status] ?? 'INTERNAL_ERROR', message,
    });
  }
}
