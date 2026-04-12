// Test that shared exports work
import * as shared from './src/index';

console.log('✓ Shared exports:', Object.keys(shared));
if (Object.keys(shared).length === 0) {
  throw new Error('Shared exports are empty!');
}
console.log('✓ Shared module test passed');
