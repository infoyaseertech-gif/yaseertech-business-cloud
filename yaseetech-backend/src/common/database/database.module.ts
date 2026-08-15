import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service';

// @Global so every feature module can inject DatabaseService without each
// one importing DatabaseModule individually -- there's only ever one pool.
@Global()
@Module({
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
