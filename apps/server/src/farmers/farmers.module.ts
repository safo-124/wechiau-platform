import { Module } from '@nestjs/common';
import { FarmerAccessController } from './farmer-access.controller.js';
import { FarmerAccessService } from './farmer-access.service.js';

@Module({
  controllers: [FarmerAccessController],
  providers: [FarmerAccessService],
})
export class FarmersModule {}
