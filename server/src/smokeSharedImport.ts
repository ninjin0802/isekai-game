// Test that server can import shared (compiled for CI smoke; not imported by app)
import * as shared from '@isekai/shared';

console.log('✓ Server can import shared');
console.log('✓ Shared exports:', Object.keys(shared));
if (Object.keys(shared).length === 0) {
  throw new Error('Cannot import shared exports!');
}
console.log('✓ Server module test passed');
