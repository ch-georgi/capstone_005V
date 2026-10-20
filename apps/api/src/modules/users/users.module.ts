import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { UserMembersService } from './user-members.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({ imports: [AuthModule, AuditModule], controllers: [UsersController], providers: [UsersService, UserMembersService] })
export class UsersModule {}
