import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Base class for domain exceptions as HTTP exceptions.
 * This follows NestJS best practices for custom exceptions.
 */
export abstract class DomainHttpException extends HttpException {
  constructor(message: string, status: HttpStatus) {
    super(message, status);
  }
}

// Domain exception classes with proper HTTP status mapping

export class BetBelowMinimumException extends DomainHttpException {
  constructor(message = 'Bet amount is below minimum') {
    super(message, HttpStatus.BAD_REQUEST);
  }
}

export class BetAboveMaximumException extends DomainHttpException {
  constructor(message = 'Bet amount is above maximum') {
    super(message, HttpStatus.BAD_REQUEST);
  }
}

export class RoundNotAcceptingBetsException extends DomainHttpException {
  constructor(message: string) {
    super(message, HttpStatus.BAD_REQUEST);
  }
}

export class DuplicateBetException extends DomainHttpException {
  constructor(message = 'Duplicate bet for same round') {
    super(message, HttpStatus.CONFLICT);
  }
}

export class NoActiveBetException extends DomainHttpException {
  constructor(message = 'No active bet found for cashout') {
    super(message, HttpStatus.BAD_REQUEST);
  }
}

export class RoundAlreadyCrashedException extends DomainHttpException {
  constructor(message = 'Round already crashed') {
    super(message, HttpStatus.BAD_REQUEST);
  }
}

export class BetAlreadyCashedOutException extends DomainHttpException {
  constructor(message = 'Bet already cashed out') {
    super(message, HttpStatus.BAD_REQUEST);
  }
}

export class RoundNotFoundException extends DomainHttpException {
  constructor(message = 'Round not found') {
    super(message, HttpStatus.NOT_FOUND);
  }
}

export class BetNotFoundException extends DomainHttpException {
  constructor(message = 'Bet not found') {
    super(message, HttpStatus.NOT_FOUND);
  }
}

export class RoundAlreadyExistsException extends DomainHttpException {
  constructor(message = 'Round already exists') {
    super(message, HttpStatus.CONFLICT);
  }
}

export class InvalidSeedException extends DomainHttpException {
  constructor(message = 'Invalid seed provided') {
    super(message, HttpStatus.BAD_REQUEST);
  }
}

export class VerificationFailedException extends DomainHttpException {
  constructor(message = 'Round verification failed') {
    super(message, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}

export class OptimisticLockException extends DomainHttpException {
  constructor(message = 'Optimistic lock conflict') {
    super(message, HttpStatus.CONFLICT);
  }
}
