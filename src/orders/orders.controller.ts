import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../common/decorators/get-user.decorator';

@ApiTags('Orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a new order',
    description: 'Create a new order for a clothes item. The userId is automatically taken from the authenticated user token.'
  })
  @ApiBody({
    type: CreateOrderDto,
    examples: {
      example1: {
        summary: 'Example: Create order for a clothes item',
        description: 'Example of creating an order with clothes ID and price',
        value: {
          clothesId: '507f1f77bcf86cd799439011',
          price: 99.99
        }
      }
    }
  })
  @ApiResponse({
    status: 201,
    description: 'Order created successfully',
    schema: {
      type: 'object',
      properties: {
        _id: { type: 'string', example: '507f1f77bcf86cd799439012' },
        clothesId: { type: 'string', example: '507f1f77bcf86cd799439011' },
        userId: { type: 'string', example: '507f1f77bcf86cd799439013' },
        price: { type: 'number', example: 99.99 },
        orderDate: { type: 'string', format: 'date-time', example: '2025-11-28T12:00:00.000Z' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' }
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - Invalid data',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 400 },
        message: { type: 'array', items: { type: 'string' } },
        error: { type: 'string', example: 'Bad Request' }
      }
    }
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Missing or invalid token'
  })
  async create(
    @GetUser() user: any,
    @Body() createOrderDto: CreateOrderDto,
  ) {
    return await this.ordersService.create(user.id, createOrderDto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get all orders for the authenticated user',
    description: 'Retrieve all orders belonging to the currently authenticated user. Orders are sorted by date (newest first).'
  })
  @ApiResponse({
    status: 200,
    description: 'List of orders retrieved successfully',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          _id: { type: 'string', example: '507f1f77bcf86cd799439012' },
              clothesId: {
                type: 'object',
                properties: {
                  _id: { type: 'string' },
                  name: { type: 'string', example: 'T-Shirt' },
                  category: { type: 'string', example: 'top' },
                  imageURL: { type: 'string', example: 'https://example.com/image.jpg' }
                }
              },
          userId: {
            type: 'object',
            properties: {
              _id: { type: 'string' },
              fullName: { type: 'string', example: 'John Doe' },
              email: { type: 'string', example: 'john@example.com' }
            }
          },
          price: { type: 'number', example: 99.99 },
          orderDate: { type: 'string', format: 'date-time', example: '2025-11-28T12:00:00.000Z' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' }
        }
      },
      example: [
        {
          _id: '507f1f77bcf86cd799439012',
          clothesId: {
            _id: '507f1f77bcf86cd799439011',
            name: 'Blue T-Shirt',
            category: 'top',
            imageURL: 'https://example.com/image.jpg'
          },
          userId: {
            _id: '507f1f77bcf86cd799439013',
            fullName: 'John Doe',
            email: 'john@example.com'
          },
          price: 99.99,
          orderDate: '2025-11-28T12:00:00.000Z',
          createdAt: '2025-11-28T12:00:00.000Z',
          updatedAt: '2025-11-28T12:00:00.000Z'
        }
      ]
    }
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Missing or invalid token'
  })
  async findAll(@GetUser() user: any) {
    return await this.ordersService.findAll(user.id);
  }

  @Get('transactions')
  @ApiOperation({
    summary: 'Get transaction history for the authenticated user',
    description: 'Retrieve all transactions (purchases, sales, top-ups) for the currently authenticated user. Transactions are sorted by date (newest first).',
  })
  @ApiResponse({
    status: 200,
    description: 'List of transactions retrieved successfully',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          _id: { type: 'string', example: '507f1f77bcf86cd799439012' },
          type: { type: 'string', enum: ['incoming', 'outgoing'], example: 'outgoing' },
          amount: { type: 'number', example: 99.99 },
          description: { type: 'string', example: 'Achat de vêtement' },
          date: { type: 'string', format: 'date-time', example: '2025-11-28T12:00:00.000Z' },
          paymentMethod: { type: 'string', example: 'balance' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Missing or invalid token',
  })
  async getTransactions(@GetUser() user: any) {
    return await this.ordersService.getTransactionsHistory(user.id);
  }

  @Get('history')
  @ApiOperation({
    summary: 'Get unified transaction history (purchases and sales)',
    description: 'Retrieve all clothing items (purchased or sold) with tags "Purchased" or "Sold". Items are sorted by date (newest first).',
  })
  @ApiResponse({
    status: 200,
    description: 'List of history items retrieved successfully',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          _id: { type: 'string', example: '507f1f77bcf86cd799439012' },
          type: { type: 'string', enum: ['Purchased', 'Sold'], example: 'Purchased' },
          clothesId: {
            type: 'object',
            properties: {
              _id: { type: 'string' },
              name: { type: 'string', example: 'T-Shirt' },
              category: { type: 'string', example: 'top' },
              imageURL: { type: 'string', example: 'https://example.com/image.jpg' },
            },
          },
          price: { type: 'number', example: 99.99 },
          date: { type: 'string', format: 'date-time', example: '2025-11-28T12:00:00.000Z' },
          createdAt: { type: 'string', format: 'date-time' },
          size: { type: 'string', example: 'M' },
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Missing or invalid token',
  })
  async getHistory(@GetUser() user: any) {
    return await this.ordersService.getUnifiedHistory(user.id);
  }
}

