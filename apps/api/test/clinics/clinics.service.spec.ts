import { Prisma } from '@prisma/client';
import { ClinicsService } from '../../src/modules/clinics/clinics.service';

const uniqueViolation = () => {
  const error: any = new Prisma.PrismaClientKnownRequestError('Unique constraint', { code: 'P2002', clientVersion: 'x' });
  return error;
};

describe('ClinicsService.create', () => {
  it('derives an uppercase, accent-free code from the name', async () => {
    const create = jest.fn().mockResolvedValue({ id: '1', name: 'Clínica Esperanza', code: 'CLINICA_ESPERANZA' });
    const prisma: any = { clinic: { create } };
    const service = new ClinicsService(prisma);

    const result = await service.create('Clínica Esperanza');

    expect(create).toHaveBeenCalledWith({ data: { name: 'Clínica Esperanza', code: 'CLINICA_ESPERANZA' }, select: { id: true, name: true, code: true } });
    expect(result).toMatchObject({ code: 'CLINICA_ESPERANZA' });
  });

  it('falls back to a generic code when the name has no alphanumeric characters', async () => {
    const create = jest.fn().mockResolvedValue({ id: '1', name: '???', code: 'CLINICA' });
    const prisma: any = { clinic: { create } };
    const service = new ClinicsService(prisma);

    await service.create('???');

    expect(create).toHaveBeenCalledWith({ data: { name: '???', code: 'CLINICA' }, select: expect.anything() });
  });

  it('retries with a numeric suffix when the generated code collides', async () => {
    const create = jest.fn()
      .mockRejectedValueOnce(uniqueViolation())
      .mockResolvedValueOnce({ id: '2', name: 'Clínica Norte', code: 'CLINICA_NORTE_2' });
    const prisma: any = { clinic: { create } };
    const service = new ClinicsService(prisma);

    const result = await service.create('Clínica Norte');

    expect(create).toHaveBeenNthCalledWith(1, { data: { name: 'Clínica Norte', code: 'CLINICA_NORTE' }, select: expect.anything() });
    expect(create).toHaveBeenNthCalledWith(2, { data: { name: 'Clínica Norte', code: 'CLINICA_NORTE_2' }, select: expect.anything() });
    expect(result.code).toBe('CLINICA_NORTE_2');
  });

  it('propagates errors that are not a unique-constraint violation', async () => {
    const boom = new Error('db down');
    const create = jest.fn().mockRejectedValue(boom);
    const prisma: any = { clinic: { create } };
    const service = new ClinicsService(prisma);

    await expect(service.create('Clínica Sur')).rejects.toThrow('db down');
    expect(create).toHaveBeenCalledTimes(1);
  });
});
