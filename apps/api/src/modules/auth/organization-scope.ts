import { SetMetadata } from '@nestjs/common';

export const organizationScopeMetadataKey = 'organizationScope';

export type OrganizationScopeSource = {
  location: 'body' | 'param';
  name: string;
};

export function OrganizationScope(location: OrganizationScopeSource['location'], name: string) {
  return SetMetadata(organizationScopeMetadataKey, { location, name });
}
