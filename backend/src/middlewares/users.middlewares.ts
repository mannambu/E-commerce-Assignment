import { NextFunction, Request, Response } from 'express'
import { checkSchema } from 'express-validator'
import { ObjectId } from 'mongodb'
import { TokenType } from '~/constants/enums'
import HTTP_STATUS from '~/constants/httpStatus'
import { USERS_MESSAGES } from '~/constants/messages'
import { ErrorWithStatus } from '~/models/Errors'
import { TokenPayload } from '~/models/requests/User.request'
import { UserRole } from '~/models/schemas/User.schema'
import databaseService from '~/services/database.services'
import usersService from '~/services/user.services'
import { verifyToken } from '~/utils/jwt'
import { validate } from '~/utils/validation'

export const registerValidator = validate(
  checkSchema(
    {
      email: {
        notEmpty: {
          errorMessage: USERS_MESSAGES.EMAIL_IS_REQUIRED
        },
        isEmail: {
          errorMessage: USERS_MESSAGES.EMAIL_IS_INVALID
        },
        trim: true,
        custom: {
          options: async (value: string) => {
            const existed = await usersService.checkEmailExist(value)
            if (existed) {
              throw new Error(USERS_MESSAGES.EMAIL_ALREADY_EXISTS)
            }
            return true
          }
        }
      },
      username: {
        notEmpty: {
          errorMessage: USERS_MESSAGES.USERNAME_IS_REQUIRED
        },
        isString: {
          errorMessage: USERS_MESSAGES.USERNAME_MUST_BE_A_STRING
        },
        isLength: {
          options: {
            min: 3,
            max: 30
          },
          errorMessage: USERS_MESSAGES.USERNAME_LENGTH_MUST_BE_FROM_3_TO_30
        },
        trim: true,
        custom: {
          options: async (value: string) => {
            const existed = await usersService.checkUsernameExist(value)
            if (existed) {
              throw new Error(USERS_MESSAGES.USERNAME_ALREADY_EXISTS)
            }
            return true
          }
        }
      },
      password: {
        notEmpty: {
          errorMessage: USERS_MESSAGES.PASSWORD_IS_REQUIRED
        },
        isString: {
          errorMessage: USERS_MESSAGES.PASSWORD_MUST_BE_A_STRING
        },
        isLength: {
          options: {
            min: 8,
            max: 50
          },
          errorMessage: USERS_MESSAGES.PASSWORD_LENGTH_MUST_BE_FROM_8_TO_50
        },
        isStrongPassword: {
          options: {
            minLength: 8,
            minLowercase: 1,
            minUppercase: 1,
            minNumbers: 1,
            minSymbols: 0
          },
          errorMessage: 'Mật khẩu phải dài ít nhất 8 ký tự, bao gồm ít nhất 1 chữ hoa, 1 chữ thường và 1 số'
        }
      },
      confirm_password: {
        notEmpty: {
          errorMessage: USERS_MESSAGES.CONFIRM_PASSWORD_IS_REQUIRED
        },
        isString: {
          errorMessage: USERS_MESSAGES.CONFIRM_PASSWORD_MUST_BE_A_STRING
        },
        custom: {
          options: (value, { req }) => {
            if (value !== req.body.password) {
              throw new Error(USERS_MESSAGES.CONFIRM_PASSWORD_MUST_BE_THE_SAME_AS_PASSWORD)
            }
            return true
          }
        }
      },
      phone: {
        notEmpty: {
          errorMessage: USERS_MESSAGES.PHONE_IS_REQUIRED
        }
        // matches: {
        //   options: /^(0[3|5|7|8|9])[0-9]{8}$/,
        //   errorMessage: 'Số điện thoại không hợp lệ (định dạng Việt Nam 10 số)'
        // }
      },
      role: {
        optional: true,
        isIn: {
          options: [[UserRole.CUSTOMER, UserRole.PT]],
          errorMessage: USERS_MESSAGES.ROLE_MUST_BE_CUSTOMER_OR_PT
        }
      }
    },
    ['body']
  )
)

export const loginValidator = validate(
  checkSchema(
    {
      identifier: {
        notEmpty: {
          errorMessage: USERS_MESSAGES.IDENTIFIER_IS_REQUIRED
        },
        isString: {
          errorMessage: USERS_MESSAGES.IDENTIFIER_MUST_BE_A_STRING
        },
        trim: true
      },
      password: {
        notEmpty: {
          errorMessage: USERS_MESSAGES.PASSWORD_IS_REQUIRED
        },
        isString: {
          errorMessage: USERS_MESSAGES.PASSWORD_MUST_BE_A_STRING
        }
      },
      remember_me: {
        optional: true,
        isBoolean: {
          errorMessage: USERS_MESSAGES.REMEMBER_ME_MUST_BE_BOOLEAN
        }
      }
    },
    ['body']
  )
)

export const forgotPasswordValidator = validate(
  checkSchema(
    {
      email: {
        notEmpty: {
          errorMessage: USERS_MESSAGES.EMAIL_IS_REQUIRED
        },
        isEmail: {
          errorMessage: USERS_MESSAGES.EMAIL_IS_INVALID
        },
        trim: true
      }
    },
    ['body']
  )
)

export const resetPasswordValidator = validate(
  checkSchema(
    {
      user_id: {
        notEmpty: {
          errorMessage: USERS_MESSAGES.USER_ID_IS_REQUIRED
        },
        isString: {
          errorMessage: USERS_MESSAGES.USER_ID_MUST_BE_A_STRING
        }
      },
      forgot_password_token: {
        notEmpty: {
          errorMessage: USERS_MESSAGES.FORGOT_PASSWORD_TOKEN_IS_REQUIRED
        },
        isString: {
          errorMessage: USERS_MESSAGES.FORGOT_PASSWORD_TOKEN_MUST_BE_A_STRING
        }
      },
      password: {
        notEmpty: {
          errorMessage: USERS_MESSAGES.PASSWORD_IS_REQUIRED
        },
        isString: {
          errorMessage: USERS_MESSAGES.PASSWORD_MUST_BE_A_STRING
        },
        isLength: {
          options: {
            min: 8,
            max: 50
          },
          errorMessage: USERS_MESSAGES.PASSWORD_LENGTH_MUST_BE_FROM_8_TO_50
        }
      },
      confirm_password: {
        notEmpty: {
          errorMessage: USERS_MESSAGES.CONFIRM_PASSWORD_IS_REQUIRED
        },
        custom: {
          options: (value, { req }) => {
            if (value !== req.body.password) {
              throw new Error(USERS_MESSAGES.CONFIRM_PASSWORD_MUST_BE_THE_SAME_AS_PASSWORD)
            }
            return true
          }
        }
      }
    },
    ['body']
  )
)

export const refreshTokenValidator = validate(
  checkSchema(
    {
      refresh_token: {
        notEmpty: {
          errorMessage: USERS_MESSAGES.REFRESH_TOKEN_IS_REQUIRED
        },
        isString: {
          errorMessage: USERS_MESSAGES.REFRESH_TOKEN_MUST_BE_A_STRING
        },
        custom: {
          options: async (value, { req }) => {
            let decoded_refresh_token: TokenPayload
            try {
              decoded_refresh_token = await verifyToken({
                token: value,
                secretOrPublicKey: process.env.JWT_SECRET_REFRESH_TOKEN as string
              })
            } catch {
              throw new ErrorWithStatus({
                message: USERS_MESSAGES.REFRESH_TOKEN_NOT_FOUND,
                status: HTTP_STATUS.UNAUTHORIZED
              })
            }

            const refreshTokenInDb = await databaseService.refreshTokens.findOne({ token: value })
            if (!refreshTokenInDb) {
              throw new ErrorWithStatus({
                message: USERS_MESSAGES.REFRESH_TOKEN_NOT_FOUND,
                status: HTTP_STATUS.UNAUTHORIZED
              })
            }

            if (decoded_refresh_token.token_type !== TokenType.RefreshToken) {
              throw new ErrorWithStatus({
                message: USERS_MESSAGES.INVALID_REFRESH_TOKEN_TYPE,
                status: HTTP_STATUS.UNAUTHORIZED
              })
            }
            ;(req as { decoded_refresh_token?: TokenPayload }).decoded_refresh_token = decoded_refresh_token
            return true
          }
        }
      }
    },
    ['body']
  )
)

export const accessTokenValidator = validate(
  checkSchema(
    {
      Authorization: {
        custom: {
          options: async (value, { req }) => {
            const authorization = (value || req?.headers?.authorization) as string
            if (!authorization) {
              throw new ErrorWithStatus({
                message: USERS_MESSAGES.ACCESS_TOKEN_IS_REQUIRED,
                status: HTTP_STATUS.UNAUTHORIZED
              })
            }
            const access_token = authorization.split(' ')[1]
            if (!access_token) {
              throw new ErrorWithStatus({
                message: USERS_MESSAGES.ACCESS_TOKEN_IS_INVALID,
                status: HTTP_STATUS.UNAUTHORIZED
              })
            }
            let decoded_authorization: TokenPayload
            try {
              decoded_authorization = await verifyToken({
                token: access_token,
                secretOrPublicKey: process.env.JWT_SECRET_ACCESS_TOKEN as string
              })
            } catch {
              throw new ErrorWithStatus({
                message: USERS_MESSAGES.ACCESS_TOKEN_IS_INVALID,
                status: HTTP_STATUS.UNAUTHORIZED
              })
            }
            if (decoded_authorization.token_type !== TokenType.AccessToken) {
              throw new ErrorWithStatus({
                message: USERS_MESSAGES.INVALID_ACCESS_TOKEN_TYPE,
                status: HTTP_STATUS.UNAUTHORIZED
              })
            }
            ;(req as { decoded_authorization?: TokenPayload }).decoded_authorization =
              decoded_authorization as TokenPayload
            return true
          }
        }
      }
    },
    ['headers']
  )
)

export const checkEmailExistQueryValidator = validate(
  checkSchema(
    {
      email: {
        notEmpty: {
          errorMessage: USERS_MESSAGES.EMAIL_IS_REQUIRED
        },
        isEmail: {
          errorMessage: USERS_MESSAGES.EMAIL_IS_INVALID
        },
        trim: true
      }
    },
    ['query']
  )
)

export const checkUsernameExistQueryValidator = validate(
  checkSchema(
    {
      username: {
        notEmpty: {
          errorMessage: USERS_MESSAGES.USERNAME_IS_REQUIRED
        },
        isString: {
          errorMessage: USERS_MESSAGES.USERNAME_MUST_BE_A_STRING
        },
        isLength: {
          options: {
            min: 3,
            max: 30
          },
          errorMessage: USERS_MESSAGES.USERNAME_LENGTH_MUST_BE_FROM_3_TO_30
        },
        trim: true
      }
    },
    ['query']
  )
)

export const healthProfileIntakeValidator = validate(
  checkSchema(
    {
      gender: {
        notEmpty: {
          errorMessage: USERS_MESSAGES.GENDER_IS_REQUIRED
        },
        isIn: {
          options: [['Male', 'Female']],
          errorMessage: USERS_MESSAGES.GENDER_IS_INVALID
        }
      },
      age: {
        notEmpty: {
          errorMessage: USERS_MESSAGES.AGE_IS_REQUIRED
        },
        isInt: {
          errorMessage: USERS_MESSAGES.AGE_MUST_BE_AN_INTEGER,
          options: {
            min: 10,
            max: 100
          }
        },
        toInt: true
      },
      heightCm: {
        notEmpty: {
          errorMessage: USERS_MESSAGES.HEIGHT_IS_REQUIRED
        },
        isFloat: {
          errorMessage: USERS_MESSAGES.HEIGHT_MUST_BE_A_NUMBER,
          options: {
            min: 100,
            max: 250
          }
        },
        toFloat: true
      },
      weightKg: {
        notEmpty: {
          errorMessage: USERS_MESSAGES.WEIGHT_IS_REQUIRED
        },
        isFloat: {
          errorMessage: USERS_MESSAGES.WEIGHT_MUST_BE_A_NUMBER,
          options: {
            min: 25,
            max: 300
          }
        },
        toFloat: true
      },
      activityLevel: {
        notEmpty: {
          errorMessage: USERS_MESSAGES.ACTIVITY_LEVEL_IS_REQUIRED
        },
        isIn: {
          options: [['Sedentary', 'Light', 'Moderate', 'Active', 'Very Active']],
          errorMessage: USERS_MESSAGES.ACTIVITY_LEVEL_IS_INVALID
        }
      },
      goal: {
        notEmpty: {
          errorMessage: USERS_MESSAGES.HEALTH_GOAL_IS_REQUIRED
        },
        isIn: {
          options: [['LoseFat', 'GainMuscle', 'MaintainWeight']],
          errorMessage: USERS_MESSAGES.HEALTH_GOAL_IS_INVALID
        }
      },
      allergies: {
        optional: true,
        isArray: {
          errorMessage: USERS_MESSAGES.ALLERGIES_MUST_BE_AN_ARRAY
        },
        custom: {
          options: (value: unknown[]) => {
            if (!Array.isArray(value) || value.every((item) => typeof item === 'string')) {
              return true
            }
            throw new Error(USERS_MESSAGES.ALLERGIES_MUST_BE_AN_ARRAY)
          }
        }
      }
    },
    ['body']
  )
)

export const updateMeValidator = validate(
  checkSchema(
    {
      username: {
        optional: true,
        isString: {
          errorMessage: USERS_MESSAGES.USERNAME_MUST_BE_A_STRING
        },
        isLength: {
          options: {
            min: 3,
            max: 30
          },
          errorMessage: USERS_MESSAGES.USERNAME_LENGTH_MUST_BE_FROM_3_TO_30
        },
        trim: true
      },
      phone: {
        optional: true,
        isString: {
          errorMessage: USERS_MESSAGES.PHONE_IS_INVALID
        },
        trim: true
      },
      date_of_birth: {
        optional: true,
        isISO8601: {
          errorMessage: USERS_MESSAGES.VALIDATION_ERROR
        }
      },
      avatar: {
        optional: true,
        custom: {
          options: (value) => {
            if (value === null || value === '') return true
            if (typeof value !== 'string') {
              throw new Error(USERS_MESSAGES.VALIDATION_ERROR)
            }

            const normalized = value.trim()
            if (!/^https?:\/\//i.test(normalized)) {
              throw new Error(USERS_MESSAGES.VALIDATION_ERROR)
            }
            return true
          }
        }
      }
    },
    ['body']
  )
)

export const updatePTProfileValidator = validate(
  checkSchema(
    {
      experienceYears: {
        optional: true,
        isInt: {
          options: {
            min: 0,
            max: 80
          },
          errorMessage: USERS_MESSAGES.VALIDATION_ERROR
        },
        toInt: true
      },
      specialties: {
        optional: true,
        isArray: {
          errorMessage: USERS_MESSAGES.VALIDATION_ERROR
        },
        custom: {
          options: (value: unknown[]) => {
            if (!Array.isArray(value) || value.every((item) => typeof item === 'string')) {
              return true
            }
            throw new Error(USERS_MESSAGES.VALIDATION_ERROR)
          }
        }
      },
      portfolioImages: {
        optional: true,
        isArray: {
          errorMessage: USERS_MESSAGES.VALIDATION_ERROR
        },
        custom: {
          options: (value: unknown[]) => {
            if (!Array.isArray(value) || value.every((item) => typeof item === 'string')) {
              return true
            }
            throw new Error(USERS_MESSAGES.VALIDATION_ERROR)
          }
        }
      }
    },
    ['body']
  )
)

export const ptServiceIdParamValidator = validate(
  checkSchema(
    {
      service_id: {
        in: ['params'],
        notEmpty: {
          errorMessage: USERS_MESSAGES.PT_SERVICE_ID_IS_REQUIRED
        },
        custom: {
          options: (value: string) => {
            if (!ObjectId.isValid(value)) {
              throw new Error(USERS_MESSAGES.PT_SERVICE_ID_IS_INVALID)
            }
            return true
          }
        }
      }
    },
    ['params']
  )
)

export const mealRecommendationValidator = validate(
  checkSchema(
    {
      days: {
        optional: true,
        custom: {
          options: (value) => {
            const parsed = Number(value)
            if (parsed !== 1 && parsed !== 7) {
              throw new Error(USERS_MESSAGES.RECOMMENDATION_DAYS_MUST_BE_1_OR_7)
            }
            return true
          }
        },
        toInt: true
      }
    },
    ['body']
  )
)

export const swapMealRecommendationValidator = validate(
  checkSchema(
    {
      current_food_id: {
        notEmpty: {
          errorMessage: USERS_MESSAGES.FOOD_ID_IS_REQUIRED
        },
        custom: {
          options: (value: string) => {
            if (!ObjectId.isValid(value)) {
              throw new Error(USERS_MESSAGES.FOOD_ID_IS_INVALID)
            }
            return true
          }
        }
      },
      target_calories: {
        optional: true,
        isFloat: {
          errorMessage: USERS_MESSAGES.TARGET_CALORIES_MUST_BE_A_NUMBER,
          options: {
            gt: 0
          }
        },
        toFloat: true
      }
    },
    ['body']
  )
)

export const recommendPTQueryValidator = validate(
  checkSchema(
    {
      limit: {
        optional: true,
        isInt: {
          options: {
            min: 1,
            max: 10
          },
          errorMessage: USERS_MESSAGES.RECOMMENDATION_LIMIT_IS_INVALID
        },
        toInt: true
      }
    },
    ['query']
  )
)

export const updateUserStatusValidator = validate(
  checkSchema(
    {
      user_id: {
        in: ['params'],
        notEmpty: {
          errorMessage: USERS_MESSAGES.USER_ID_IS_REQUIRED
        },
        isMongoId: {
          errorMessage: USERS_MESSAGES.USER_ID_MUST_BE_A_STRING
        }
      },
      status: {
        in: ['body'],
        notEmpty: {
          errorMessage: USERS_MESSAGES.VALIDATION_ERROR
        },
        isIn: {
          options: [['Active', 'Locked']],
          errorMessage: USERS_MESSAGES.VALIDATION_ERROR
        }
      }
    },
    ['params', 'body']
  )
)

export const debugValidator = (req: Request, res: Response, next: NextFunction) => {
  console.log('Debug Validator - Request Body:', req.body)
  console.log('Debug Validator - Request Headers:', req.headers)
  next()
}

export const isAdminValidator = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const decoded_authorization = (req as unknown as { decoded_authorization: TokenPayload }).decoded_authorization
    
    // Tìm user trong database dựa vào user_id lấy từ token
    const user = await databaseService.users.findOne({ 
      _id: new ObjectId(decoded_authorization.user_id) 
    })

    // Kiểm tra Role
    if (!user || user.role !== UserRole.ADMIN) {
      return next(new ErrorWithStatus({
        message: 'Chỉ có Quản trị viên (Admin) mới được phép thực hiện hành động này',
        status: HTTP_STATUS.FORBIDDEN
      }))
    }

    // Nếu đúng là Admin thì cho phép đi tiếp
    next()
  } catch (error) {
    next(error)
  }
}