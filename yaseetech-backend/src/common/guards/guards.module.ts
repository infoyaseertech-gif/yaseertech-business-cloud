import { Global, Module } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PermissionsGuard } from './permissions.guard';

// Referencing a guard by class in @UseGuards(SomeGuard) only works if Nest
// can resolve that class's own constructor dependencies through its DI
// container -- which means the guard itself has to be a registered
// provider somewhere Nest can see. Making this @Global() means every
// feature module can use @UseGuards(JwtAuthGuard) / @UseGuards(PermissionsGuard)
// without importing this module explicitly, the same way DatabaseModule works.
@Global()
@Module({
  providers: [JwtAuthGuard, PermissionsGuard],
  exports: [JwtAuthGuard, PermissionsGuard],
})
export class GuardsModule {}
