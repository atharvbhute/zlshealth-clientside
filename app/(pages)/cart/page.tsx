/**
 * This page represents a multi-step checkout flow with three main stages:
 * 1. Cart Review (Products in cart and wishlist)
 * 2. Shopping Information (Contact + Shipping Address + Delivery options)
 * 3. Payment Method (Payment selection and summary)
 * 
 * Features:
 * - Dynamic step navigation (Cart -> Shopping -> Payment) using `activeButton` state.
 * - Transition animations for smooth appearance of sections.
 * - Discount banner with available offers.
 * - Left section (steps: cart, shopping, payment forms).
 * - Right section (price details, payment methods, coupons).
 * - Gradient underline effects for section headers.
 * 
 */

"use client"

import Product from '@/components/Product'
import { Address, initialAddress, statesOfIndia } from '@/interfaces/user'
import { product } from '@/interfaces/products'
import { useAppDispatch, useAppSelector } from '@/lib/hooks'
import { deleteCart, deleteFromCart, updateQuantity } from '@/lib/thunks/cartThunks'
import { getMyAddress } from '@/lib/thunks/userThunks'
import { removeFromWishlist } from '@/lib/thunks/wishlistThunks'
import { axiosClient } from '@/utils/axiosClient'
import Image from 'next/image'
import Link from 'next/link'
import React, { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { BiSolidOffer } from 'react-icons/bi'
import { FiHeart } from 'react-icons/fi'
import { LuPen } from 'react-icons/lu'
import { MdKeyboardArrowRight } from 'react-icons/md'
import { RxCross1 } from 'react-icons/rx'
import { SlArrowDown, SlArrowLeft, SlArrowRight } from 'react-icons/sl'
import { getItem, KEY_ACCESS_TOKEN } from '@/utils/localStorageManager'
import { deleteFromCartGuest, updateQuantityGuest } from '@/lib/features/cartSlice'
import { removeFromWishlistGuest } from '@/lib/features/wishlistSlice'
import { handlePayment } from '@/utils/handlePayment'
import { formatAddress } from '@/utils/formatAddress'
import { formatDate } from '@/utils/formatDate'
import CartButton from '@/components/CartButton'
import { convertWishlistToProduct } from '@/interfaces/cartWish'
import { useRouter } from 'next/navigation'
import PaymentProcessing from '@/components/PaymentProcessing'

const paymentMehods = [
    "/cart/Visa.png",
    "/cart/Mastercard.png",
    "/cart/Stripe.png",
    "/cart/Paypal.png",
    "/cart/ApplePay.png"
]

export interface OrderSummary {
    orderId: string;
    date: string;
    paymentMethod: string;
    discountPrice: number;
    totalItems: number;
    totalAmount: number;
    payableAmount: number;
}

function Page() {
    const [status, setStatus] = useState<"processing" | "success" | "failed">("success")
    const [activeButton, setActiveButton] = useState("cart")
    const [addresses, setAddresses] = useState<Address>(initialAddress)
    const [futureAddress, setFutureAddress] = useState(false);
    const [billingAddress, setBillingAddress] = useState(false)
    const [orderSuccessful, setOrderSuccessful] = useState(false)
    const [makingOrder, setMakingOrder] = useState(false)
    const [orderSummary, setOrderSummary] = useState<OrderSummary>({
        orderId: "",
        date: "",
        paymentMethod: "",
        discountPrice: 0,
        totalItems: 0,
        totalAmount: 0,
        payableAmount: 0
    });
    const [similarProducts, setSimilarProducts] = useState<product[]>([])

        // ======= Coupon State =======
    const [couponCode, setCouponCode] = useState("");
    const [couponDiscount, setCouponDiscount] = useState(0); // ₹ amount reduced by coupon
    const [appliedCoupon, setAppliedCoupon] = useState<any | null>(null);
    const [couponLoading, setCouponLoading] = useState(false);
    const [availableCoupons, setAvailableCoupons] = useState<any[]>([]);
    const [showAllCoupons, setShowAllCoupons] = useState(false);

    const scrollRef = useRef<HTMLDivElement | null>(null)

    // Dispatch items to the cart / appConfig
    const dispatch = useAppDispatch()
    const router = useRouter();



    // ================ Cart And Wishlist Logics ================

    // Get cart items from Redux store
    const cart = useAppSelector((state) => state.cartSlice.cart)

    // Calculate total items in cart
    const totalItems = cart?.reduce((acc, item) => acc + item?.quantity, 0)

    // Calculate total price of cart items
        const totalPrice = parseFloat(
        cart?.reduce((acc, item) => acc + item?.price * item?.quantity, 0).toFixed(2)
    );

    const discountedTotalPrice = parseFloat(
        cart?.reduce(
            (acc, item) =>
                acc + (item?.price - (item?.price * item?.discount) / 100) * item?.quantity,
            0
        ).toFixed(2)
    );

    const packagingPrice = 20;

    // Base total before coupon
    const baseTotal = discountedTotalPrice + packagingPrice;

    // Final payable after coupon discount (never below 0)
    const paymentAmountNumber = Math.max(0, baseTotal - couponDiscount);
    const paymentAmount = paymentAmountNumber.toFixed(2);


    // Check if cart is empty
    const isCartEmpty = cart?.length === 0

    // Get wishlist products from Redux store
    const wishlist = useAppSelector((state) => state.wishlistSlice.products)

    // Check if wishlist is empty
    const isWishlistEmpty = wishlist.length === 0

    // Check if user is logged in
    const isUser = getItem(KEY_ACCESS_TOKEN)

    const currentPath = window.location.pathname + window.location.search;
    const path = `/login?redirect=${encodeURIComponent(currentPath)}`



    // ================ Addresses/Shopping Logics ================
    const address = useAppSelector((state) => state.appConfig.myAddress)

    // Function to fetch user default address from backend
    const getAddresses = async () => {
        try {
            const defaultAddress = address.find((adrs: Address) => adrs.isDefault)
            setAddresses(defaultAddress || initialAddress)
            if (defaultAddress) setFutureAddress(true)
        } catch { }
    }

    useEffect(() => {
        getAddresses()
    }, [address])

    /**
          * Handles form input changes and updates `addresses` state.
          *
          * @param e - The change event from the input element.
        */
    const handleChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
    ) => {
        const { name, value, type } = e.target;
        setAddresses({
            ...addresses,
            [name]: type === "checkbox" && "checked" in e.target ? e.target.checked : value
        })
    }

    /**
       * Submits the form to either add a new address or update an existing one.
       * - Removes `_id` if creating a new address.
       * - Sends request to `/api/users/addresses`.
       * - Passes updated addresses back to parent via `onUpdate`.
       *
       * @param e - The form submit event.
    */
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (!isUser) {
                toast.error("Please login to place order")
                router.push(path)
                return;
            }

            if (cart.length === 0) {
                return toast.error("Cart is empty.")
            }

            if (activeButton === "cart") {
                setActiveButton("shopping")
                return;
            }

            setMakingOrder(true)
            // Get the user's default address (latest from state)
            const defaultAddress = address.find((adrs: Address) => adrs.isDefault)

            // If no address present in backend (means first-time entry)
            const isNewAddress = !defaultAddress

            // If new address -> send it to backend directly
            if (isNewAddress) {
                // Clone form data to avoid mutating state directly
                const payload = { ...addresses }

                // If adding a new address, remove `_id`
                if (!addresses._id) delete payload._id

                const res = await axiosClient.put(`/api/users/addresses`, payload);
                await dispatch(getMyAddress());
                toast.success(res.data.result);
                placeOrder(payload);
            }

            // Compare each field to check if something changed
            const isChanged = Object.keys(addresses).some((key) => {
                const typedKey = key as keyof Address;
                return addresses[typedKey] !== defaultAddress![typedKey]
            });

            // If address fields are same -> skip backend update and place order
            if (!isChanged) {
                placeOrder(defaultAddress!)
                return;
            }

            // Else -> address has changed -> update backend
            const payload = { ...addresses }
            if (!addresses?._id) {
                delete payload._id;
            }

            // Send request to backend
            const res = await axiosClient.put(
                `/api/users/addresses`,
                payload
            );

            // Dispatch to update addresses
            await dispatch(getMyAddress())
            toast.success(res.data.result)

            // Call place order function on address updation
            placeOrder(payload)
        } catch { setMakingOrder(false) }
    }

    const placeOrder = async (address: Address) => {
        try {
            if (cart?.length === 0) {
                return toast.error("Cart is empty")
            }
            setStatus("processing")
            setActiveButton("payment")
            const paymentSuccess = await handlePayment(paymentAmountNumber, cart, address)
            if (paymentSuccess) {
                setStatus("success")
                setOrderSummary({
                    orderId: paymentSuccess.orderId,
                    date: paymentSuccess.date,
                    paymentMethod: paymentSuccess.paymentMethod,
                    totalAmount: totalPrice,
                    discountPrice: totalPrice - discountedTotalPrice,
                    totalItems: cart?.length,
                    payableAmount: paymentAmountNumber,
                })
                await dispatch(deleteCart())
                setOrderSuccessful(true)
            } else {
                setStatus("failed")
                setActiveButton("shopping")
            }
        } catch { }
        setMakingOrder(false)
    }

    // ================ Coupon Logics ================
        const handleApplyCoupon = async () => {
        if (!couponCode.trim()) {
            toast.error("Please enter a coupon code");
            return;
        }

        if (cart.length === 0) {
            toast.error("Cart is empty");
            return;
        }

        try {
            setCouponLoading(true);

            // 🔹 Call your backend route for validation
            // You can implement /api/coupons/validate to:
            // - Check code exists
            // - Check minOrderAmount
            // - Return discountAmount & maxDiscountAmount

            const res = await axiosClient.post("/api/validateCoupon", {
                code: couponCode.trim().toUpperCase(),
                cartTotal: baseTotal,
            });

            const data = res.data;
            const coupon = data?.result;

            if (!coupon) {
                throw new Error("Invalid coupon");
            }

            // Business rules
            if (baseTotal < coupon.minOrderAmount) {
                throw new Error(
                    `Minimum order amount for this coupon is ₹${coupon.minOrderAmount}`
                );
            }

            // Calculate discount based on percentage
            const discountPercentage = Number(coupon.discountPercentage) || 0;
            const calculatedDiscount = (baseTotal * discountPercentage) / 100;
            const maxDiscount = Number(coupon.maxDiscountAmount) || calculatedDiscount;

            // Final allowed discount (capped by max discount and baseTotal)
            const discountToApply = Math.min(calculatedDiscount, maxDiscount, baseTotal);

            console.log('Coupon Debug:', {
                baseTotal,
                discountPercentage,
                calculatedDiscount,
                maxDiscount,
                discountToApply,
                coupon,
                rawCouponData: data
            });

            setAppliedCoupon(coupon);
            setCouponDiscount(discountToApply);
            setCouponCode(coupon.code); // normalize
            toast.success(`Coupon ${coupon.code} applied! You saved ₹${discountToApply.toFixed(2)}`);
        } catch (err: any) {
            console.error(err);
            const msg =
                err.response?.data?.result ||
                err.message ||
                "Failed to apply coupon";
            toast.error(msg);
            setAppliedCoupon(null);
            setCouponDiscount(0);
        } finally {
            setCouponLoading(false);
        }
    };

    const handleRemoveCoupon = () => {
        setAppliedCoupon(null);
        setCouponDiscount(0);
        setCouponCode("");
        toast.success("Coupon removed");
    };

    // Apply coupon directly from coupon card
    const handleQuickApplyCoupon = async (couponCodeToApply: string) => {
        setCouponCode(couponCodeToApply);

        if (cart.length === 0) {
            toast.error("Cart is empty");
            return;
        }

        try {
            setCouponLoading(true);

            const res = await axiosClient.post("/api/validateCoupon", {
                code: couponCodeToApply.trim().toUpperCase(),
                cartTotal: baseTotal,
            });

            const data = res.data;
            const coupon = data?.result;

            if (!coupon) {
                throw new Error("Invalid coupon");
            }

            // Business rules
            if (baseTotal < coupon.minOrderAmount) {
                throw new Error(
                    `Minimum order amount for this coupon is ₹${coupon.minOrderAmount}`
                );
            }

            // Calculate discount based on percentage
            const discountPercentage = Number(coupon.discountPercentage) || 0;
            const calculatedDiscount = (baseTotal * discountPercentage) / 100;
            const maxDiscount = Number(coupon.maxDiscountAmount) || calculatedDiscount;

            // Final allowed discount (capped by max discount and baseTotal)
            const discountToApply = Math.min(calculatedDiscount, maxDiscount, baseTotal);

            console.log('Quick Apply Coupon Debug:', {
                baseTotal,
                discountPercentage,
                calculatedDiscount,
                maxDiscount,
                discountToApply,
                coupon,
                rawCouponData: data
            });

            setAppliedCoupon(coupon);
            setCouponDiscount(discountToApply);
            setCouponCode(coupon.code);
            toast.success(`Coupon ${coupon.code} applied! You saved ₹${discountToApply.toFixed(2)}`);
        } catch (err: any) {
            console.error(err);
            const msg =
                err.response?.data?.result ||
                err.message ||
                "Failed to apply coupon";
            toast.error(msg);
            setAppliedCoupon(null);
            setCouponDiscount(0);
        } finally {
            setCouponLoading(false);
        }
    };




    // ================ Suggested Items Logics ================

    // Function to scroll left
    const scrollLeft = () => {
        if (scrollRef.current) {
            scrollRef.current.scrollBy({
                left: -300,
                behavior: "smooth"
            })
        }
    }

    // Function to scroll right
    const scrollRight = () => {
        if (scrollRef.current) {
            scrollRef.current.scrollBy({
                left: 300,
                behavior: "smooth"
            })
        }
    }

    // Fetch available coupons
    useEffect(() => {
        const fetchCoupons = async () => {
            try {
                const response = await axiosClient.get("/api/coupons");
                if (response.data.status === "ok") {
                    setAvailableCoupons(response.data.result);
                }
            } catch (error) {
                console.error("Failed to fetch coupons:", error);
            }
        };
        fetchCoupons();
    }, []);

    useEffect(() => {
        const categories = [...new Set(cart?.map(item => item.category))]
        const productTypes = [...new Set(cart?.flatMap(item => item.productTypes))]
        const benefits = [...new Set(cart?.flatMap(item => item.benefits))]
        const exclude = [...new Set(cart?.map(item => item._id))]

        const params = new URLSearchParams();

        categories.forEach(id => params.append("category", id))
        productTypes.forEach(id => params.append("productTypes", id))
        benefits.forEach(id => params.append("benefits", id))
        exclude.forEach(id => params.append("exclude", id))

        const url = `/api/products/similarProducts?${params.toString()}`

        const getSimilarProducts = async () => {
            const response = await axiosClient.get(url);
            setSimilarProducts(response.data.result)
        }
        getSimilarProducts()
    }, [cart])

    return (
        <div className='flex flex-col items-center m-10'>

            {isCartEmpty && !orderSuccessful ? (
                <>
                    {/* Empty Cart Message */}
                    <div className="flex flex-col items-center justify-center space-y-5 my-20">
                        
                        <div className="text-center">
                            <p className="text-xl text-[#848484] mb-3">
                                Your cart is empty.
                            </p>
                            <Link
                                href="/products"
                                className='text-lg underline decoration-[#71BF45] text-[#71BF45] font-medium'
                            >
                                Add Products
                            </Link>
                        </div>
                    </div>

                    {/* SUGGESTED PRODUCTS */}
                    <div className="space-y-[30px] w-full">
                        {/* Similar products heading and scrolling buttons */}
                        <div className="flex items-center justify-between">
                            {isCartEmpty ? <h2 className="text-2xl font-semibold">Suggested Products</h2> : <h2 className="text-2xl font-semibold">Others Also Buy</h2>}
                            <div className="flex items-center gap-3">
                                {/* Left Button */}
                                <div
                                    onClick={scrollLeft}
                                    className='border-2 border-[#093C16] text-[#093C16] hover:text-white hover:bg-[#093C16] rounded-full p-[5px] md:p-2.5 cursor-pointer'
                                >
                                    <SlArrowLeft />
                                </div>

                                {/* Right Button */}
                                <div
                                    onClick={scrollRight}
                                    className='border-2 border-[#093C16] text-[#093C16] hover:text-white hover:bg-[#093C16] rounded-full p-[5px] md:p-2.5 cursor-pointer'
                                >
                                    <SlArrowRight />
                                </div>
                            </div>
                        </div>

                        {/* Similar Products */}
                        <div
                            ref={scrollRef}
                            className="flex scroll-smooth
                            overflow-x-auto gap-2.5 sm:gap-5 scrollbar-hide"
                        >
                            {similarProducts.map((product) => (
                                <div
                                    className='w-[200px] sm:w-[250px] md:w-[300px] shrink-0'
                                    key={product?._id}
                                >
                                    <Product product={product} />
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            ) : orderSuccessful ? (
                <div className='w-full flex flex-col md:flex-row items-center space-y-10 md:space-y-0 md:justify-between mb-10 md:mb-3.5 max-w-screen-2xl mx-auto'>
                    {/* ============ Thankyou Message / Billing Address ============ */}
                    <div className="space-y-6 md:py-10 text-wrap max-w-xs lg:max-w-lg">

                        {/* ============ Thankyou Message ============ */}
                        <div className="space-y-3">
                            <p className="font-medium text-xl md:text-2xl text-[#093C16]">
                                Thank you for your purchase, {addresses.fullName}!
                            </p>
                            <div className="text-sm md:text-base font-medium text-[#848484]">
                                Your order has been received and is now being processed.
                                We&apos;ll send you a confirmation email shortly, and you&apos;ll
                                be notified again once your package is shipped.
                            </div>
                        </div>

                        {/* ============ Billing Address ============ */}
                        <div className="space-y-3">
                            <h5 className="font-medium text-lg md:text-xl text-[#093C16]">
                                Billing Address
                            </h5>
                            <p className="text-sm md:text-base font-medium text-[#000000]">
                                Name:{" "}
                                <span className='text-[#848484]'>{addresses.fullName}</span>
                            </p>
                            <p className="text-sm md:text-base font-medium text-[#000000]">
                                Address:{" "}
                                <span className='text-[#848484]'>
                                    {formatAddress(addresses)}
                                </span>
                            </p>
                            <p className="text-sm md:text-base font-medium text-[#000000]">
                                Phone:{" "}
                                <span className='text-[#848484]'>
                                    {addresses.phone}
                                </span>
                            </p>
                            <p className="text-sm md:text-base font-medium text-[#000000]">
                                Email:{" "}
                                <span className='text-[#848484]'>
                                    {addresses.email}
                                </span>
                            </p>
                        </div>
                    </div>

                    {/* ============ Order Summary ============ */}
                    <div className="flex flex-col space-y-3 md:space-y-4 p-5 md:p-10 rounded-[20px] border border-[#71BF45]">
                        <p className="font-medium text-lg md:text-xl text-[#093C16] text-center">
                            Order Summary
                        </p>
                        <div className="flex items-center justify-between border-b-2 border-[#848484]">
                            <div className="space-y-2.5 py-2.5 pr-2.5">
                                <h6 className="px-2.5 font-medium text-sm text-[#848484]">
                                    Date
                                </h6>
                                <p className="px-2.5 font-medium text-xs text-[#000000]">
                                    {formatDate(orderSummary.date)}
                                </p>
                            </div>
                            <div className="space-y-2.5 py-2.5 pr-2.5">
                                <h6 className="px-2.5 font-medium text-sm text-[#848484]">
                                    Order Number
                                </h6>
                                <p className="px-2.5 font-medium text-xs text-[#000000]">
                                    {orderSummary.orderId}
                                </p>
                            </div>
                            <div className="space-y-2.5 py-2.5 pr-2.5">
                                <h6 className="px-2.5 font-medium text-sm text-[#848484]">
                                    Payment Method
                                </h6>
                                <p className="px-2.5 font-medium text-xs text-[#000000]">
                                    {orderSummary.paymentMethod}
                                </p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between px-2.5">
                                <p className="text-sm">
                                    Total MRP{" "}
                                    <span className="font-medium text-xs text-[#71BF45]">
                                        ({orderSummary.totalItems} items)
                                    </span>
                                </p>
                                <p className="font-medium text-sm">
                                    ₹{orderSummary.totalAmount}
                                </p>
                            </div>
                            {orderSummary.discountPrice > 0 && (
                                <div className="flex items-center justify-between px-2.5">
                                    <p className="text-sm">Discount on MRP</p>
                                    <p className="font-medium text-sm text-[#71BF45]">-₹{orderSummary.discountPrice.toFixed(2)}</p>
                                </div>
                            )}
                            {couponDiscount > 0 && (
                                <div className="flex justify-between items-center px-2.5">
                                    <p className="text-sm">Coupon Discount</p>
                                    <p className="text-sm font-medium text-[#71BF45]">-₹{couponDiscount.toFixed(2)}</p>
                                </div>
                            )}
                            <div className="flex items-center justify-between px-2.5">
                                <p className="text-sm">Delivery Charges</p>
                                <p className="font-medium text-sm">Free</p>
                            </div>
                            <div className="flex items-center justify-between px-2.5">
                                <p className="text-sm">Packaging/Handling Fee</p>
                                <p className="font-medium">₹{packagingPrice}</p>
                            </div>

                            <div className='border border-[#E3E3E3]' />

                            <div className="flex items-center justify-between px-2.5">
                                <p className="font-medium">Total Amount</p>
                                <p className="font-semibold text-[#093C16]">₹{orderSummary.payableAmount}</p>
                            </div>
                        </div>

                        {/* Confirmation Button */}
                        <button
                            type="button"
                            onClick={() => {
                                setActiveButton("cart"),
                                    setOrderSuccessful(false)
                            }}
                            className='p-2.5 bg-[#848484] rounded-[8px] text-white font-semibold'
                        >
                            Order Confirmed
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    {/* ================ CHECKOUT PROGRESS BAR ================ */}
                    <div className="flex justify-center items-center mb-3.5">
                        {/* CART BUTTON */}
                        <button
                            onClick={() => setActiveButton("cart")}
                            className="flex items-center gap-2.5 transition-all duration-500 ease-out cursor-pointer"
                        >
                            {/* Step number */}
                            <p
                                className={`font-extrabold text-xs md:text-sm py-[2.5px] px-2 md:py-[7px] md:px-3.5 rounded-full transition-all duration-500 ease-out
                        ${activeButton === "cart"
                                        ? "text-white bg-[#71BF45]"
                                        : "text-[#848484] bg-[#e3e3e3]"}
                        `}
                            >
                                1
                            </p>
                            {/* Step label */}
                            <p
                                className={`transition-all duration-300 ease-out text-sm md:text-base
                            ${activeButton === "cart"
                                        ? "text-bold text-[#71BF45]"
                                        : "text-medium text-[#848484]"}
                            `}
                            >
                                Cart
                            </p>
                        </button>

                        {/* HORIZONTAL BAR */}
                        <div className="w-8 sm:w-20 md:w-40 h-0.5 mx-2.5 bg-[#e3e3e3] transition-all duration-300 ease-out" />

                        {/* SHOPPING BUTTON */}
                        <button
                            onClick={() => setActiveButton("shopping")}
                            className="flex items-center gap-2.5 transition-all duration-500 ease-out cursor-pointer"
                        >
                            {/* Step number */}
                            <p
                                className={`font-extrabold text-xs md:text-sm py-[2.5px] px-2 md:py-[7px] md:px-3.5 rounded-[60px] transition-all duration-500 ease-out
                        ${activeButton === "shopping"
                                        ? "text-white bg-[#71BF45]"
                                        : "text-[#848484] bg-[#e3e3e3]"}`}
                            >
                                2
                            </p>
                            {/* Step label */}
                            <p
                                className={`transition-all duration-500 ease-out text-sm md:text-base
                            ${activeButton === "shopping"
                                        ? "text-bold text-[#71BF45]"
                                        : "text-medium text-[#848484]"}
                        `}
                            >
                                Shopping
                            </p>
                        </button>

                        {/* HORIZONTAL BAR */}
                        <div className="w-8 sm:w-20 md:w-40 h-0.5 mx-2.5 bg-[#e3e3e3] transition-all duration-500 ease-out" />

                        {/* PAYMENT BUTTON */}
                        <button
                            className="flex items-center gap-2.5 transition-all duration-500 ease-out"
                        >
                            {/* Step number */}
                            <p
                                className={`font-extrabold text-xs md:text-sm py-[2.5px] px-2 md:py-[7px] md:px-3.5 rounded-[60px] transition-all duration-500 ease-out
                        ${activeButton === "payment"
                                        ? "text-white bg-[#71BF45]"
                                        : "text-[#848484] bg-[#e3e3e3] cursor-not-allowed"}`}
                            >
                                3
                            </p>
                            {/* Step label */}
                            <p
                                className={`transition-all duration-500 ease-out text-sm md:text-base
                            ${activeButton === "payment"
                                        ? "text-bold text-[#71BF45]"
                                        : "text-medium text-[#848484]"}
                        `}
                            >
                                Payment
                            </p>
                        </button>
                    </div>

                    {/* ================ DISCOUNT BANNER ================= */}
                    <div className="p-5 rounded-[20px] border-2 border-[#e3e3e3] space-y-3.5 w-full max-w-screen-2xl mx-auto">
                        <div className="flex items-center gap-[5px] text-[#71BF45]">
                            <BiSolidOffer />
                            <p className="font-semibold underline decoration-solid decoration-[12.5%]">
                                Available Offers
                            </p>
                        </div>

                        {/* Offers List */}
                        <ul className='space-y-2.5 list-disc font-semibold text-sm pl-5'>
                            <li>
                                10% Instant Discount {" "}
                                <span className="font-normal">
                                    on ICICI Bank Credit Card on a minimum spend of ₹1,000. TCA
                                </span>
                            </li>
                            <li>
                                Free Delivery {" "}
                                <span className="font-normal">
                                    on all prepaid orders above ₹699.
                                </span>
                            </li>
                        </ul>
                    </div>

                    {/* ================ MAIN CONTENT AREA ================ */}
                    <div className="space-y-[30px] mt-10">

                        <p className="font-semibold text-xl text-center">Your Cart</p>

                        <div className="flex flex-col lg:flex-row gap-[30px] lg:gap-3">
                            {/* LEFT SECTION (Dynamic Step Content) */}
                            <div className="flex-2 space-y-[30px] lg:h-screen lg:overflow-y-scroll scrollbar-hide">

                                {/* Cart/Wishlist Section */}
                                {activeButton === "cart" && (
                                    <>
                                        {/* ================ CART ================ */}
                                        <div className="p-2.5 border border-[#e3e3e3] rounded-[20px] transition-all duration-500 ease-out opacity-0 translate-y-2 animate-fadeInCart">

                                            {/* HEADERS */}
                                            <div className="grid grid-cols-3 items-center pb-2.5 text-center text-sm font-medium">
                                                <p>Product</p>
                                                <p>Quantity</p>
                                                <p>Price</p>
                                                <p></p>
                                            </div>

                                            {/* Sample Products */}
                                            {cart?.map((product, idx) => (
                                                    <div key={product?._id}>
                                                        {/* Border */}
                                                        <div className="border border-[#e3e3e3] mx-3" />

                                                        {/* Cart Products */}
                                                        <div className="grid grid-cols-3 items-start py-2.5">
                                                            <div className="flex gap-3">
                                                                {/* Serial N0. */}
                                                                <p>{idx + 1}.</p>

                                                                <div className="flex flex-col md:flex-row gap-3">
                                                                    {/* Product Image*/}
                                                                    <div className="relative w-[40px] h-[40px] md:w-[96px] md:h-[93px]">
                                                                        <Image
                                                                            src={product?.img}
                                                                            alt={product?.name}
                                                                            fill
                                                                            className='rounded-[10px] border md:border-2 border-[#71BF45] object-cover'
                                                                        />
                                                                    </div>

                                                                    {/* Product details */}
                                                                    <div className="flex flex-col justify-between font-medium">
                                                                        <div>
                                                                            <Link
                                                                                href={`/productDescription/${product?._id}`}
                                                                                className='text-sm'
                                                                            >
                                                                                {product?.name}
                                                                            </Link>
                                                                            <p className='text-xs'>{product?.about}</p>
                                                                        </div>

                                                                        <Link
                                                                            href={`/productDescription/${product?._id}`}
                                                                            className="flex items-center gap-[5px] text-xs text-[#093C16]">
                                                                            <p>Read More</p>
                                                                            <SlArrowDown />
                                                                        </Link>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Product quantity */}
                                                            <div className="flex justify-center">
                                                                <select
                                                                    id="quantity"
                                                                    value={product?.quantity}
                                                                    onChange={(e) => {
                                                                        const newQuantity = parseInt(e.target.value);
                                                                        if (isUser) {
                                                                            dispatch(updateQuantity({ productId: product?._id, quantity: newQuantity }));
                                                                        } else {
                                                                            dispatch(updateQuantityGuest({ productId: product?._id, quantity: newQuantity }));
                                                                        }
                                                                    }}
                                                                    className="w-[49px] md:w-[84px] h-fit border border-[#e3e3e3] rounded-[5px] p-[5px] focus:outline-none"
                                                                >
                                                                    <option value="1">1</option>
                                                                    <option value="2">2</option>
                                                                    <option value="3">3</option>
                                                                    <option value="4">4</option>
                                                                    <option value="5">5</option>
                                                                </select>
                                                            </div>

                                                            {/* Product Price */}
                                                            <div className="flex justify-center items-center gap-4">
                                                                 {product?.discount > 0 && (
                                                                <p className="font-medium text-base text-[#093C16]">
                                                                    ₹{(product?.price - (product?.price * product?.discount) / 100)}{" "}
                                                                    <span className="font-normal text-[10px] line-through text-[#848484]">
                                                                        ₹{product?.price}
                                                                    </span>{" "}
                                                                   
                                                                        <span className="hidden md:block font-medium text-[10px] text-[#71BF45]">({product?.discount}% off)</span>
                                                                   
                                                                </p>
                                                                 )}
                                                                <p className="font-medium text-base text-[#093C16]">
                                                                    ₹{product?.price}

                                                                </p>
                                                                <RxCross1
                                                                    className="text-[#848484] cursor-pointer"
                                                                    onClick={() => isUser
                                                                        ? dispatch(deleteFromCart({ productId: product?._id }))
                                                                        : dispatch(deleteFromCartGuest(product?._id))}
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))
                                            }

                                        </div>

                                        {/* ================ WISHLIST ================ */}
                                        <div className="p-2.5 border border-[#e3e3e3] rounded-[20px] transition-all duration-500 ease-out opacity-0 translate-y-2 animate-fadeInCart">

                                            {/* HEADERS */}
                                            <div className="flex items-center justify-between py-3 px-2.5">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-1 rounded-[60px] bg-[#71BF45] text-white">
                                                        <FiHeart />
                                                    </div>
                                                    <p className="font-medium text-sm">Add items from wishlist</p>
                                                </div>

                                                <Link href="/wishlist" className="flex items-center gap-2.5">
                                                    <p className="text-sm underline decoration-solid text-[#093C16]">View All</p>
                                                    <MdKeyboardArrowRight className='text-xs' />
                                                </Link>
                                            </div>

                                            {isWishlistEmpty ?
                                                <div className="text-center border-t border-[#e3e3e3] pt-5 pb-4">
                                                    <p className="text-[#848484]">
                                                        Wishlist is empty.
                                                    </p>
                                                    <Link
                                                        href="/products"
                                                        className='text-sm underline decoration-[#71BF45] text-[#71BF45]'
                                                    >
                                                        Add Products
                                                    </Link>
                                                </div>
                                                : wishlist.map((product, idx) => (
                                                    <div key={product?._id}>
                                                        {/* BORDER */}
                                                        <div className="border border-[#e3e3e3] mx-3" />

                                                        {/* CART PRODUCTS */}
                                                        <div className="grid grid-cols-3 items-start py-2.5">
                                                            <div className="flex gap-3">
                                                                {/* SERIAL NO. */}
                                                                <p>{idx + 1}.</p>

                                                                <div className="flex flex-col md:flex-row gap-3">
                                                                    {/* PRODUCT IMAGE */}
                                                                    <div className="relative w-[40px] h-[40px] md:w-[96px] md:h-[93px]">
                                                                        <Image
                                                                            src={product?.img}
                                                                            alt={product?.name}
                                                                            fill
                                                                            className='rounded-[10px] border md:border-2 border-[#71BF45] object-cover'
                                                                        />
                                                                    </div>

                                                                    {/* PRODUCT DETAILS */}
                                                                    <div className="flex flex-col justify-between font-medium">
                                                                        <div>
                                                                            <Link
                                                                                href={`/productDescription/${product?._id}`}
                                                                                className='text-sm'
                                                                            >
                                                                                {product?.name}
                                                                            </Link>
                                                                            <p className='text-xs'>{product?.about}</p>
                                                                        </div>

                                                                        <Link
                                                                            href={`/productDescription/${product?._id}`}
                                                                            className="flex items-center gap-[5px] text-xs text-[#093C16]">
                                                                            <p>Read More</p>
                                                                            <SlArrowDown />
                                                                        </Link>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <div className="flex justify-center">
                                                                <select
                                                                    id="quantity"
                                                                    value={product?.quantity}
                                                                    onChange={(e) => {
                                                                        const newQuantity = parseInt(e.target.value);
                                                                        if (isUser) {
                                                                            dispatch(updateQuantity({ productId: product?._id, quantity: newQuantity }));
                                                                        } else {
                                                                            dispatch(updateQuantityGuest({ productId: product?._id, quantity: newQuantity }));
                                                                        }
                                                                    }}
                                                                    className="w-[49px] md:w-[84px] h-fit border border-[#e3e3e3] rounded-[5px] p-[5px] focus:outline-none"
                                                                >
                                                                    <option value="1">1</option>
                                                                    <option value="2">2</option>
                                                                    <option value="3">3</option>
                                                                </select>
                                                            </div>

                                                            <div className="flex flex-col h-full justify-between">
                                                                <div className="flex justify-center items-center gap-4">
                                                                    <p className="font-medium text-base text-[#093C16]">
                                                                        ₹{(product?.price - (product?.price * product?.discount) / 100).toFixed(2)}{" "}
                                                                        <span className="font-normal text-[10px] line-through text-[#848484]">
                                                                            ₹{(product?.price).toFixed(2)}
                                                                        </span>{" "}
                                                                        <span className="hidden md:block font-medium text-[10px] text-[#71BF45]">({product?.discount}% off)</span>
                                                                    </p>
                                                                    <RxCross1
                                                                        className="text-[#848484] cursor-pointer"
                                                                        onClick={() => isUser
                                                                            ? dispatch(removeFromWishlist({ productId: product?._id }))
                                                                            : dispatch(removeFromWishlistGuest(product?._id))
                                                                        }
                                                                    />
                                                                </div>
                                                                <CartButton product={convertWishlistToProduct(product)} />
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                        </div>
                                    </>
                                )}

                                {/* Shopping Section */}
                                {activeButton === "shopping" && (
                                    <div
                                        className="p-2.5 border-[3px] border-[#e3e3e3] rounded-[20px] transition-all
                                duration-500 ease-out opacity-0 translate-y-2 animate-fadeInCart min-w-60"
                                    >
                                        <form className="space-y-3">
                                            {/* HEADER */}
                                            <div className="border-b-2 p-2.5 border-[#e3e3e3] font-medium">
                                                Contact Information
                                            </div>

                                            {/* Full Name and Mobile Number Input */}
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
                                                <div className="flex flex-col space-y-3 text-sm text-[#848484]">
                                                    <label htmlFor="fullName" className='font-medium px-2.5'>Full Name *</label>
                                                    <input
                                                        type="text"
                                                        name='fullName'
                                                        id="fullName"
                                                        value={addresses?.fullName}
                                                        onChange={handleChange}
                                                        placeholder='Enter Full Name'
                                                        className='rounded-[10px] border border-[#cdcdcd] p-2.5 focus:outline-none'
                                                        required
                                                    />
                                                </div>

                                                <div className="flex flex-col space-y-3 text-sm text-[#848484]">
                                                    <label
                                                        htmlFor="phone"
                                                        className='font-medium px-2.5'>
                                                        Mobile Number *
                                                    </label>
                                                    <input
                                                        type="text"
                                                        name='phone'
                                                        id="phone"
                                                        value={addresses?.phone}
                                                        onChange={handleChange}
                                                        placeholder='(+91)-'
                                                        className='rounded-[10px] border border-[#cdcdcd] p-2.5 focus:outline-none'
                                                        required
                                                    />
                                                    <div className="text-xs">*You will receive an OTP for confirmation.</div>
                                                </div>
                                            </div>

                                            {/* Email Input */}
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
                                                <div className=" flex flex-col space-y-3 text-sm text-[#848484]">
                                                    <label
                                                        htmlFor="email"
                                                        className='font-medium px-2.5'
                                                    >
                                                        Email{" "}
                                                        <span className="text-xs font-normal">
                                                            (Optional, For Order Updates)
                                                        </span> *
                                                    </label>
                                                    <label
                                                        htmlFor='email'
                                                        className="flex items-center justify-between rounded-[10px] 
                                                border border-[#cdcdcd] p-2.5"
                                                    >
                                                        <input
                                                            type="email"
                                                            name='email'
                                                            id="email"
                                                            value={addresses?.email}
                                                            onChange={handleChange}
                                                            placeholder='Enter email'
                                                            className='focus:outline-none'
                                                        />
                                                        {!addresses?.email && <p className="text-xs">@gmail.com</p>}
                                                    </label>
                                                </div>
                                                <div className="" />
                                            </div>

                                            {/* ================ SHIPPING ADDRESS ================ */}

                                            {/* Heading */}
                                            <p className="border-b-2 p-2.5 border-[#e3e3e3] font-medium">
                                                Shipping Address
                                            </p>

                                            {/* Street Addresss inputs */}
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
                                                {/* Street Address / House No. */}
                                                <div className="flex flex-col space-y-3 text-sm text-[#848484]">
                                                    <label
                                                        htmlFor="streetAddress"
                                                        className='font-medium px-2.5'
                                                    >
                                                        Street Address / House No.
                                                    </label>
                                                    <input
                                                        type="text"
                                                        name="streetAddressHouseNo"
                                                        id="streetAddress"
                                                        value={addresses?.streetAddressHouseNo}
                                                        onChange={handleChange}
                                                        placeholder='Street Address / House No.'
                                                        className='rounded-[10px] border border-[#cdcdcd] p-2.5 focus:outline-none'
                                                    />
                                                </div>

                                                {/* Street Address 2 */}
                                                <div className=" flex flex-col space-y-3 text-sm text-[#848484]">
                                                    <label
                                                        htmlFor="streetAddressLine2"
                                                        className='font-medium px-2.5'
                                                    >
                                                        Street Address Line 2
                                                    </label>
                                                    <input
                                                        type="text"
                                                        name='streetAddress2'
                                                        id="streetAddressLine2"
                                                        value={addresses?.streetAddress2}
                                                        onChange={handleChange}
                                                        placeholder='Street Address Line 2'
                                                        className='rounded-[10px] border border-[#cdcdcd] p-2.5 focus:outline-none'
                                                    />
                                                </div>
                                            </div>

                                            {/* Address Type and Landmark inputs */}
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
                                                {/* Address Type */}
                                                <div className="flex flex-col space-y-3 text-sm text-[#848484]">
                                                    <label
                                                        htmlFor="addressType"
                                                        className='font-medium px-2.5'
                                                    >
                                                        Address Type (Home / Work / Other)
                                                    </label>
                                                    <select
                                                        id="addressType"
                                                        name='addressType'
                                                        value={addresses?.addressType}
                                                        onChange={handleChange}
                                                        className='rounded-[10px] border border-[#cdcdcd] p-3 focus:outline-none'
                                                        required
                                                    >
                                                        <option value="">(Address Type)</option>
                                                        <option value="home">Home</option>
                                                        <option value="work">Work</option>
                                                        <option value="other">Other</option>
                                                    </select>
                                                </div>

                                                {/* Landmark */}
                                                <div className="flex flex-col space-y-3 text-sm text-[#848484]">
                                                    <label
                                                        htmlFor="landmark"
                                                        className='font-medium px-2.5'
                                                    >
                                                        Landmark (Optional)
                                                    </label>
                                                    <input
                                                        type="text"
                                                        name='landmark'
                                                        id="landmark"
                                                        value={addresses?.landmark}
                                                        onChange={handleChange}
                                                        placeholder='Landmark (Optional)'
                                                        className='rounded-[10px] border border-[#cdcdcd] p-2.5 focus:outline-none'
                                                    />
                                                </div>
                                            </div>

                                            {/* City/Town and State inputs */}
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
                                                {/* City input */}
                                                <div className="flex-1 flex flex-col space-y-3 text-sm text-[#848484]">
                                                    <label
                                                        htmlFor="cityTown"
                                                        className='font-medium px-2.5'
                                                    >
                                                        City / Town
                                                    </label>
                                                    <input
                                                        type="text"
                                                        name="cityTown"
                                                        id="cityTown"
                                                        value={addresses?.cityTown}
                                                        onChange={handleChange}
                                                        placeholder='City / Town'
                                                        className='rounded-[10px] border border-[#cdcdcd] p-2.5 focus:outline-none'
                                                        required
                                                    />
                                                </div>

                                                {/* State input */}
                                                <div className="flex-1 flex flex-col space-y-3 text-sm text-[#848484]">
                                                    <label
                                                        htmlFor="state"
                                                        className='font-medium px-2.5'
                                                    >
                                                        State
                                                    </label>
                                                    <select
                                                        name='state'
                                                        id="state"
                                                        value={addresses?.state}
                                                        onChange={handleChange}
                                                        className='rounded-[10px] border border-[#cdcdcd] p-3 focus:outline-none'
                                                        required
                                                    >
                                                        {statesOfIndia.map((state, idx) => (
                                                            <option key={idx} value={state}>
                                                                {state === "" ? "(Select Your State)" : state}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>

                                            {/* Pincode input */}
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
                                                {/* Pincode input */}
                                                <div className=" flex flex-col space-y-3 text-sm text-[#848484]">
                                                    <label
                                                        htmlFor="pincode"
                                                        className='font-medium px-2.5'
                                                    >
                                                        Pincode
                                                    </label>
                                                    <div
                                                        className="flex items-center justify-between rounded-[10px] border border-[#cdcdcd] p-2.5"
                                                    >
                                                        <input
                                                            type="text"
                                                            name="pinCode"
                                                            id="pincode"
                                                            value={addresses?.pinCode}
                                                            onChange={handleChange}
                                                            placeholder='Enter PINCODE'
                                                            className='focus:outline-none'
                                                        />
                                                        <LuPen className="text-xs" />
                                                    </div>
                                                </div>
                                                {/* Empty div */}
                                                <div className="" />
                                            </div>

                                            {/* Delivery and Quick Options */}
                                            <div className="flex md:items-center gap-4 md:justify-between">
                                                {/* Delivery Options */}
                                                <div className="space-y-4">
                                                    <p className="relative p-2.5 text-sm md:text-base font-medium">
                                                        Delivery Options
                                                        <span className="absolute left-0 bottom-0 w-full h-[2px] bg-gradient-to-r from-[#E3E3E3] to-[#ffffff]" />
                                                    </p>

                                                    <div className="flex items-center gap-1.5">
                                                        <input type="checkbox" id="standardDelivery" className='text-[#848484] border-[1.5px]' />
                                                        <label htmlFor="standardDelivery" className='text-xs md:text-sm'>Standard Delivery (3-5 Days, Free)</label>
                                                    </div>

                                                    <div className="flex items-center gap-1.5">
                                                        <input type="checkbox" id="expressDelivery" className='text-[#848484] border-[1.5px]' />
                                                        <label htmlFor="expressDelivery" className='text-xs md:text-sm'>Express Delivery (1-2 Days, ₹99)</label>
                                                    </div>

                                                    <div className="flex items-center gap-1.5">
                                                        <input type="checkbox" id="scheduleDelivery" className='text-[#848484] border-[1.5px]' />
                                                        <label htmlFor="scheduleDelivery" className='text-xs md:text-sm'>Schedule Delivery (Choose Date & Time)</label>
                                                    </div>
                                                </div>

                                                {/* Quick Options */}
                                                <div className="space-y-4">
                                                    <p className="relative p-2.5 text-sm md:text-base font-medium">
                                                        Quick Options
                                                        <span className="absolute left-0 bottom-0 w-full h-[2px] bg-gradient-to-r from-[#E3E3E3] to-[#ffffff]" />
                                                    </p>

                                                    <div className="flex items-center gap-1.5">
                                                        <input
                                                            type="checkbox"
                                                            id="futureOrders"
                                                            name='futureOrders'
                                                            checked={futureAddress}
                                                            onChange={() => setFutureAddress(!futureAddress)}
                                                            className='text-[#848484] border-[1.5px]'
                                                        />
                                                        <label htmlFor="futureOrders" className='text-xs md:text-sm'>Save This Address For Future Orders</label>
                                                    </div>

                                                    <div className="flex items-center gap-1.5">
                                                        <input
                                                            type="checkbox"
                                                            id="defaultAddress"
                                                            name='isDefault'
                                                            checked={addresses?.isDefault}
                                                            onChange={handleChange}
                                                            className='text-[#848484] border-[1.5px]'
                                                        />
                                                        <label htmlFor="defaultAddress" className='text-xs md:text-sm'>Mark As Default Address</label>
                                                    </div>

                                                    <div className="flex items-center gap-1.5">
                                                        <input
                                                            type="checkbox"
                                                            id="billingAddress"
                                                            name='billingAddress'
                                                            checked={billingAddress}
                                                            onChange={() => setBillingAddress(!billingAddress)}
                                                            className='text-[#848484] border-[1.5px]'
                                                        />
                                                        <label htmlFor="billingAddress" className='text-xs md:text-sm'>Same As Billing Address</label>
                                                    </div>
                                                </div>
                                            </div>
                                        </form>
                                    </div>
                                )}

                                {/* Payment Section */}
                                {activeButton === "payment" && (
                                    <div className="border border-[#e3e3e3] rounded-[20px] w-full md:w-[500px] h-80 transition-all duration-500 ease-out opacity-0 translate-y-2 animate-fadeInCart">
                                        <PaymentProcessing status={status} />
                                    </div>
                                )}
                            </div>

                            {/* RIGHT SECTION */}
                            <div className="flex-1 space-y-[30px] lg:h-screen lg:overflow-y-scroll scrollbar-hide">
                                {/* PRICE DETAILS */}
                                <div className="p-2.5 border border-[#e3e3e3] rounded-[20px]">
                                    <div className="flex items-center justify-between border-b-2 border-[#e3e3e3] p-2.5">
                                        <p className="font-medium text-sm">
                                            Price Details
                                        </p>
                                        <p className="font-medium text-sm text-[#71BF45]">
                                            ({totalItems} items)
                                        </p>
                                    </div>

                                    <div className="space-y-3 border-b-2 border-[#e3e3e3]">
                                        <div className="flex justify-between items-center p-2.5">
                                            <p className="text-sm">Total MRP <span className="text-xs font-normal text-[#71BF45]">({totalItems} items)</span></p>
                                            <p className="text-sm font-medium">₹{totalPrice}</p>
                                        </div>
                                        {(totalPrice - discountedTotalPrice) > 0 && (
                                            <div className="flex justify-between items-center p-2.5">
                                                <p className="text-sm">Discount on MRP</p>
                                                <p className="text-sm font-medium text-[#71BF45]">-₹{(totalPrice - discountedTotalPrice).toFixed(2)}</p>
                                            </div>
                                        )}
                                        {couponDiscount > 0 && (
                                            <div className="flex justify-between items-center p-2.5">
                                                <p className="text-sm">Coupon Discount</p>
                                                <p className="text-sm font-medium text-[#71BF45]">-₹{couponDiscount.toFixed(2)}</p>
                                            </div>
                                        )}
                                        <div className="flex justify-between items-center p-2.5">
                                            <p className="text-sm">Delivery Charges</p>
                                            <p className="text-sm font-medium">Free</p>
                                        </div>
                                        <div className="flex justify-between items-center p-2.5">
                                            <p className="text-sm">Packaging / Handling Fee</p>
                                            <p className="text-sm font-medium">₹{packagingPrice}</p>
                                        </div>
                                    </div>

                                    <div className="flex justify-between p-2.5">
                                        <p className='font-medium'>Total Amount</p>
                                        <p className='font-semibold text-[#093C16]'>₹{paymentAmount}</p>
                                    </div>

                                    <button
                                        onClick={handleSubmit}
                                        disabled={makingOrder}
                                        className={`rounded-[10px] py-2 md:py-3 px-2.5 text-white bg-[#093C16] w-full
                                             ${makingOrder ? "opacity-70 cursor-not-allowed" : "cursor-pointer"}`}
                                    >
                                        {activeButton === "cart" ? "Next" : "Place Order"}
                                    </button>

                                    <div className="space-y-3">
                                        <p className="border-b-2 border-[#e3e3e3] p-2.5">Payment Method</p>
                                        <div className="py-2.5 px-5 flex items-center gap-[25px]">
                                            {paymentMehods.map((img, idx) => (
                                                <Image
                                                    key={idx}
                                                    src={img}
                                                    alt={`payment-method-${idx + 1}`}
                                                    width="60"
                                                    height="60"
                                                />
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* COUPONS */}
                                <div className="p-2.5 border border-[#e3e3e3] rounded-[20px]">
                                    <div className="space-y-3">
                                        <div className="flex justify-between items-center">
                                            <p className="font-semibold text-sm text-[#848484]">
                                                Coupons {availableCoupons.length > 0 && `(${availableCoupons.length})`}
                                            </p>
                                            {availableCoupons.length > 3 && (
                                                <button
                                                    onClick={() => setShowAllCoupons(!showAllCoupons)}
                                                    className="flex items-center gap-2.5"
                                                >
                                                    <p className="text-sm underline decoration-solid text-[#093C16]">
                                                        {showAllCoupons ? "Show Less" : "View All"}
                                                    </p>
                                                    <MdKeyboardArrowRight className='text-xs' />
                                                </button>
                                            )}
                                        </div>

                                        <div className="flex justify-between items-center p-[2.5px] md:p-[5px] border-2 border-[#e3e3e3] rounded-[5px]">
    <input
        type="text"
        placeholder="Enter Code"
        value={couponCode}
        onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
        className="text-xs font-medium text-[#848484] focus:outline-none w-full bg-transparent px-2"
    />
    {appliedCoupon ? (
        <button
            type="button"
            onClick={handleRemoveCoupon}
            className="py-1 md:py-2 px-3 md:px-4 bg-[#F97373] text-white rounded-[5px] text-xs md:text-sm"
        >
            Remove
        </button>
    ) : (
        <button
            type="button"
            onClick={handleApplyCoupon}
            disabled={couponLoading}
            className="py-1 md:py-2 px-3 md:px-6 bg-[#71BF45] text-[#093C16] rounded-[5px] disabled:opacity-70 disabled:cursor-not-allowed"
        >
            {couponLoading ? "Applying..." : "Apply"}
        </button>
    )}
</div>

{appliedCoupon && (
    <p className="mt-1 text-xs text-[#093C16]">
        Applied coupon: <span className="font-semibold">{appliedCoupon.code}</span> &mdash; You saved ₹{couponDiscount.toFixed(2)}
    </p>
)}


                                        <div className="border border-[#e3e3e3]" />

                                        {/* DYNAMIC COUPONS FROM DATABASE */}
                                        <div className="space-y-3">
                                            {availableCoupons.length === 0 ? (
                                                <div className="text-center py-4">
                                                    <p className="text-sm text-[#848484]">No coupons available at the moment</p>
                                                </div>
                                            ) : (
                                                (showAllCoupons ? availableCoupons : availableCoupons.slice(0, 3)).map((coupon, index) => {
                                                    const isApplied = appliedCoupon?.code === coupon.code;
                                                    const canApply = baseTotal >= coupon.minOrderAmount;

                                                    return (
                                                        <div
                                                            key={coupon._id || index}
                                                            className={`border p-[5px] rounded-[5px] space-y-[5px] transition-all ${
                                                                isApplied
                                                                    ? "border-[#71BF45] bg-[#71BF45]/5"
                                                                    : "border-[#e3e3e3]"
                                                            }`}
                                                        >
                                                            <div className="flex justify-between items-center">
                                                                <div className="flex items-center gap-[5px]">
                                                                    <input
                                                                        type="checkbox"
                                                                        id={`coupon-${index}`}
                                                                        checked={isApplied}
                                                                        onChange={() => {
                                                                            if (isApplied) {
                                                                                handleRemoveCoupon();
                                                                            } else {
                                                                                handleQuickApplyCoupon(coupon.code);
                                                                            }
                                                                        }}
                                                                        className="border-[1.5px] border-[#848484] rounded-sm cursor-pointer"
                                                                        disabled={!canApply && !isApplied}
                                                                    />
                                                                    <label
                                                                        htmlFor={`coupon-${index}`}
                                                                        className={`text-sm font-semibold ${
                                                                            isApplied ? "text-[#71BF45]" : "text-[#000000]"
                                                                        } ${!canApply && !isApplied ? "opacity-50" : ""}`}
                                                                    >
                                                                        {coupon.code}
                                                                    </label>
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        if (isApplied) {
                                                                            handleRemoveCoupon();
                                                                        } else {
                                                                            handleQuickApplyCoupon(coupon.code);
                                                                        }
                                                                    }}
                                                                    disabled={(!canApply && !isApplied) || couponLoading}
                                                                    className={`font-semibold text-sm ${
                                                                        isApplied
                                                                            ? "text-red-500"
                                                                            : canApply
                                                                            ? "text-[#71BF45]"
                                                                            : "text-[#848484] opacity-50"
                                                                    } disabled:opacity-50`}
                                                                >
                                                                    {isApplied ? "Remove" : "Apply"}
                                                                </button>
                                                            </div>

                                                            <div className="border border-[#e3e3e3] border-dashed" />

                                                            <div className="flex flex-col gap-1">
                                                                <p className="text-xs text-[#848484]">
                                                                    Get {coupon.discountPercentage}% Off
                                                                    {coupon.maxDiscountAmount &&
                                                                        ` (Max ₹${coupon.maxDiscountAmount})`}{" "}
                                                                    on orders above ₹{coupon.minOrderAmount}
                                                                </p>
                                                                {!canApply && !isApplied && (
                                                                    <p className="text-xs text-red-500">
                                                                        Add ₹{(coupon.minOrderAmount - baseTotal).toFixed(2)} more to
                                                                        apply this coupon
                                                                    </p>
                                                                )}
                                                                {isApplied && (
                                                                    <p className="text-xs text-[#71BF45] font-semibold">
                                                                        ✓ Applied! You saved ₹{couponDiscount.toFixed(2)}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* SUGGESTED PRODUCTS - For non-empty cart */}
                    {!isCartEmpty && (
                        <div className="space-y-[30px] w-full mt-6 md:mt-8">
                            {/* Similar products heading and scrolling buttons */}
                            <div className="flex items-center justify-between">
                                <h2 className="text-2xl font-semibold">Others Also Buy</h2>
                                <div className="flex items-center gap-3">
                                    {/* Left Button */}
                                    <div
                                        onClick={scrollLeft}
                                        className='border-2 border-[#093C16] text-[#093C16] hover:text-white hover:bg-[#093C16] rounded-full p-[5px] md:p-2.5 cursor-pointer'
                                    >
                                        <SlArrowLeft />
                                    </div>

                                    {/* Right Button */}
                                    <div
                                        onClick={scrollRight}
                                        className='border-2 border-[#093C16] text-[#093C16] hover:text-white hover:bg-[#093C16] rounded-full p-[5px] md:p-2.5 cursor-pointer'
                                    >
                                        <SlArrowRight />
                                    </div>
                                </div>
                            </div>

                            {/* Similar Products */}
                            <div
                                ref={scrollRef}
                                className="flex scroll-smooth
                                overflow-x-auto gap-2.5 sm:gap-5 scrollbar-hide"
                            >
                                {similarProducts.map((product) => (
                                    <div
                                        className='w-[200px] sm:w-[250px] md:w-[300px] shrink-0'
                                        key={product?._id}
                                    >
                                        <Product product={product} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}

export default Page