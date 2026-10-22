import { Controller,Get,Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt,IsOptional,IsString,IsUUID,Max,MaxLength,Min } from 'class-validator';
import { ApiBearerAuth,ApiOperation,ApiProperty,ApiPropertyOptional,ApiTags,ApiOkResponse,ApiResponse } from '@nestjs/swagger';
import { TenantRole } from '@prisma/client';
import { CurrentContext,RequireAccess } from '../../common/decorators/access';
import { TenantContext } from '../../common/types/auth-context';
import { SyncService } from './sync.service';
export class SyncQuery {
 @ApiProperty({format:'uuid'}) @IsUUID() clinicId!:string;
 @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(4096) cursor?:string;
 @ApiPropertyOptional({default:100,minimum:1,maximum:500}) @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(500) limit=100;
}
@ApiTags('Sync') @ApiBearerAuth() @Controller('sync')
export class SyncController {
 constructor(private readonly sync:SyncService) {}
 @Get() @RequireAccess({roles:[TenantRole.PATIENT,TenantRole.CLINICIAN,TenantRole.CLINIC_ADMIN]})
 @ApiOkResponse({description:'SyncResponse: mode SNAPSHOT/DELTA, access, permissionRevision, changes (PATIENT/EXAM/EXAM_VERSION with current authorized payloads), nextCursor, revision and hasMore. Revisions are decimal strings.'})
 @ApiResponse({status:400,description:'INVALID_CURSOR or invalid query.'})
 @ApiResponse({status:409,description:'SYNC_RESET_REQUIRED: discard cursor and request a new snapshot.'})
 @ApiResponse({status:503,description:'SYNC_NOT_CONFIGURED: server cursor secret is missing.'})
 @ApiOperation({summary:'Sincronizar metadatos autorizados: snapshot inicial o delta con cursor firmado.'})
 get(@CurrentContext() ctx:TenantContext,@Query() query:SyncQuery){return this.sync.get(ctx,query);}
}
